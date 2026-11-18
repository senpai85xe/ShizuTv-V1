import {
  MediaType,
  SourceInfo,
  UnifiedChapter,
  UnifiedEpisode,
  UnifiedMedia,
  VideoServer,
  VideoStream,
} from '../types/media';
import { fetchJikanEpisodes, searchJikan } from './jikan';
import { fetchKitsuEpisodes } from './kitsu';
import { searchAniList } from './anilist';
import {
  AniZipMappingsResponse,
  isGenericEpisodeTitle,
  mergeRealEpisodes,
  parseAniListStreamingEpisodes,
  parseAniZipEpisodes,
} from '../utils/episodeResolver';
import {
  analyzeEpisodeResolution,
  EpisodeFetchTrace,
  EpisodeProviderStep,
  ProviderTraceStatus,
  recordEpisodeTrace,
} from '../utils/episodeDiagnostics';

export const INBUILT_SOURCES: SourceInfo[] = [
  {
    id: 'shonenx-hls-inbuilt',
    name: 'ShizuTv Stream (Inbuilt)',
    type: 'inbuilt',
    mediaTypes: ['ANIME', 'MOVIE', 'TV'],
    lang: 'en',
    version: '2.1.5',
    description: 'Adaptive HLS & subtitle-ready built-in anime streaming resolver.',
  },
  {
    id: 'shonenx-manga-inbuilt',
    name: 'ShizuTv Reader (Inbuilt)',
    type: 'inbuilt',
    mediaTypes: ['MANGA', 'NOVEL'],
    lang: 'en',
    version: '2.1.5',
    description: 'High-contrast manga & light novel reader source.',
  },
  {
    id: 'hianime-bridge',
    name: 'AniWatch / HiAnime (Bridge)',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '1.4.2',
    description: 'Community anime extension profile (SUB & DUB servers).',
  },
  {
    id: 'mangadex-bridge',
    name: 'MangaDex (Bridge)',
    type: 'extension',
    mediaTypes: ['MANGA'],
    lang: 'multi',
    version: '1.8.0',
    description: 'Multi-language scanlation chapter resolver.',
  },
];

const aniZipCache = new Map<string, { expires: number; data: AniZipMappingsResponse }>();

interface AniZipFetchOutcome {
  data: AniZipMappingsResponse | null;
  status: ProviderTraceStatus;
  durationMs: number;
  targetId: string | null;
  note: string;
  errorMessage?: string | null;
  fromCache?: boolean;
}

async function fetchAniZipMappingsDetailed(
  media: UnifiedMedia,
  bypassCache = false,
): Promise<AniZipFetchOutcome> {
  const startedAt = performance.now();
  const anilistId =
    media.externalIds?.anilist || (media.providerId === 'anilist' || !media.providerId ? media.id : null);
  const malId = media.idMal || media.externalIds?.mal || (media.providerId === 'myanimelist' ? media.id : null);

  let queryParam = '';
  if (anilistId && /^\d+$/.test(String(anilistId))) {
    queryParam = `anilist_id=${encodeURIComponent(String(anilistId))}`;
  } else if (malId && /^\d+$/.test(String(malId))) {
    queryParam = `mal_id=${encodeURIComponent(String(malId))}`;
  } else {
    return {
      data: null,
      status: 'skipped',
      durationMs: Math.round(performance.now() - startedAt),
      targetId: null,
      note: 'No numeric AniList or MAL ID available for AniZip lookup',
    };
  }

  const now = Date.now();
  const cached = !bypassCache ? aniZipCache.get(queryParam) : undefined;
  if (cached && cached.expires > now) {
    return {
      data: cached.data,
      status: cached.data.episodes ? 'hit' : 'empty',
      durationMs: Math.round(performance.now() - startedAt),
      targetId: queryParam,
      note: 'Served from 30m in-memory AniZip cache',
      fromCache: true,
    };
  }

  try {
    const response = await fetch(`https://api.ani.zip/mappings?${queryParam}`, {
      signal: AbortSignal.timeout(7000),
    });
    const elapsed = Math.round(performance.now() - startedAt);
    if (!response.ok) {
      return {
        data: null,
        status: 'error',
        durationMs: elapsed,
        targetId: queryParam,
        note: `AniZip returned HTTP ${response.status}`,
        errorMessage: `HTTP ${response.status} ${response.statusText || ''}`.trim(),
      };
    }
    const data = (await response.json()) as AniZipMappingsResponse;
    aniZipCache.set(queryParam, { expires: now + 30 * 60_000, data });
    return {
      data,
      status: data.episodes && Object.keys(data.episodes).length > 0 ? 'hit' : 'empty',
      durationMs: elapsed,
      targetId: queryParam,
      note: `Fetched mappings (${data.episodeCount ?? Object.keys(data.episodes || {}).length} keys)`,
    };
  } catch (err) {
    const elapsed = Math.round(performance.now() - startedAt);
    const errMsg = err instanceof Error ? err.message : String(err);
    const isTimeout = isTimeoutFailure(err);
    return {
      data: null,
      status: isTimeout ? 'timeout' : 'error',
      durationMs: elapsed,
      targetId: queryParam,
      note: isTimeout ? 'AniZip request timed out (7000ms)' : 'AniZip network error',
      errorMessage: errMsg,
    };
  }
}

function isTimeoutFailure(err: unknown): boolean {
  if (err instanceof Error && err.name === 'TimeoutError') return true;
  const msg = err instanceof Error ? err.message : String(err || '');
  return /timeout|timed out/i.test(msg);
}

function summarizeSampleTitles(episodes: UnifiedEpisode[]): string[] {
  return episodes.slice(0, 4).map((e) => `${e.number}. ${e.title}`);
}

export function resolveFallbackEpisodesCount(media: Pick<UnifiedMedia, 'episodes' | 'nextEpisode'>): number {
  const fromEpisodes = media.episodes && media.episodes > 0 ? media.episodes : 0;
  const fromAiring = media.nextEpisode && media.nextEpisode > 1 ? media.nextEpisode - 1 : 0;
  const maxCount = Math.max(fromEpisodes, fromAiring);
  return maxCount > 0 ? maxCount : 12;
}

export interface ResolveEpisodesOptions {
  sourceId?: string;
  sourceName?: string;
  overrideTitle?: string;
  overrideMedia?: UnifiedMedia | null;
  bypassCache?: boolean;
  recordTrace?: boolean;
}

export async function resolveEpisodesWithDiagnostics(
  media: UnifiedMedia,
  options?: ResolveEpisodesOptions,
): Promise<{ episodes: UnifiedEpisode[]; trace: EpisodeFetchTrace }> {
  const overallStart = performance.now();
  let targetMedia = media;
  const overrideQuery = options?.overrideTitle?.trim();
  let overrideMatched = false;

  if (options?.overrideMedia && options.overrideMedia.id) {
    overrideMatched = true;
    targetMedia = {
      ...options.overrideMedia,
      streamingEpisodes:
        options.overrideMedia.id === media.id
          ? options.overrideMedia.streamingEpisodes ?? media.streamingEpisodes
          : options.overrideMedia.streamingEpisodes,
    };
  } else if (overrideQuery) {
    try {
      const anilistMatches = await searchAniList({
        query: overrideQuery,
        type: 'ANIME',
        page: 1,
        perPage: 1,
      });
      if (anilistMatches.items[0]) {
        overrideMatched = true;
        targetMedia = {
          ...anilistMatches.items[0],
          streamingEpisodes:
            anilistMatches.items[0].id === media.id ? media.streamingEpisodes : undefined,
        };
      }
    } catch {
      try {
        const jikanMatches = await searchJikan(overrideQuery, 'ANIME', 1);
        if (jikanMatches.items[0]) {
          overrideMatched = true;
          targetMedia = jikanMatches.items[0];
        }
      } catch {
        // Ignore search override failure cleanly
      }
    }
  }

  const fromEpisodes = targetMedia.episodes && targetMedia.episodes > 0 ? targetMedia.episodes : 0;
  const fromAiring =
    targetMedia.nextEpisode && targetMedia.nextEpisode > 1 ? targetMedia.nextEpisode - 1 : 0;
  const knownCount = Math.max(fromEpisodes, fromAiring);

  const initialMalId =
    targetMedia.idMal ||
    targetMedia.externalIds?.mal ||
    (targetMedia.providerId === 'myanimelist' ? targetMedia.id : null);

  const bypassProviderCache = Boolean(options?.bypassCache);
  const jikanStart = performance.now();
  const [aniZipOutcome, jikanResult] = await Promise.all([
    fetchAniZipMappingsDetailed(targetMedia, bypassProviderCache),
    initialMalId
      ? fetchJikanEpisodes(String(initialMalId), bypassProviderCache)
          .then((eps) => ({
            episodes: eps,
            durationMs: Math.round(performance.now() - jikanStart),
            error: null as string | null,
            timedOut: false,
          }))
          .catch((err) => ({
            episodes: [] as UnifiedEpisode[],
            durationMs: Math.round(performance.now() - jikanStart),
            error: err instanceof Error ? err.message : String(err),
            timedOut: isTimeoutFailure(err),
          }))
      : Promise.resolve({
          episodes: [] as UnifiedEpisode[],
          durationMs: 0,
          error: null as string | null,
          timedOut: false,
        }),
  ]);

  const aniZipData = aniZipOutcome.data;
  const aniZipEpisodes = parseAniZipEpisodes(aniZipData, targetMedia);
  let jikanEpisodes = jikanResult.episodes;
  let jikanDuration = jikanResult.durationMs;
  let jikanError = jikanResult.error;
  let jikanTimedOut = jikanResult.timedOut;
  let effectiveMalId = initialMalId ? String(initialMalId) : null;

  // If MAL ID was missing on initial media (e.g. Kitsu origin) but discovered via AniZip, hydrate Jikan filler metadata
  const discoveredMalId = aniZipData?.mappings?.mal_id ? String(aniZipData.mappings.mal_id) : null;
  if (!effectiveMalId && discoveredMalId && jikanEpisodes.length === 0) {
    effectiveMalId = discoveredMalId;
    const retryStart = performance.now();
    try {
      jikanEpisodes = await fetchJikanEpisodes(discoveredMalId, bypassProviderCache);
      jikanDuration = Math.round(performance.now() - retryStart);
    } catch (err) {
      jikanDuration = Math.round(performance.now() - retryStart);
      jikanError = err instanceof Error ? err.message : String(err);
      jikanTimedOut = isTimeoutFailure(err);
    }
  }

  const aniListStreaming = parseAniListStreamingEpisodes(
    targetMedia.streamingEpisodes,
    targetMedia.id,
  );

  // If neither AniZip nor Jikan yielded real episode titles, try Kitsu episodes when ID is available
  const kitsuId =
    targetMedia.externalIds?.kitsu ||
    (targetMedia.providerId === 'kitsu' ? targetMedia.id : null) ||
    (aniZipData?.mappings?.kitsu_id ? String(aniZipData.mappings.kitsu_id) : null);

  const hasRichTitlesAlready =
    aniZipEpisodes.some((e) => !isGenericEpisodeTitle(e.title, e.number)) ||
    jikanEpisodes.some((e) => !isGenericEpisodeTitle(e.title, e.number)) ||
    aniListStreaming.length > 0;

  let kitsuEpisodes: UnifiedEpisode[] = [];
  let kitsuDuration = 0;
  let kitsuError: string | null = null;
  let kitsuTimedOut = false;
  let kitsuAttempted = false;
  if (kitsuId && !hasRichTitlesAlready) {
    kitsuAttempted = true;
    const kitsuStart = performance.now();
    try {
      kitsuEpisodes = await fetchKitsuEpisodes(String(kitsuId), bypassProviderCache);
      kitsuDuration = Math.round(performance.now() - kitsuStart);
    } catch (err) {
      kitsuDuration = Math.round(performance.now() - kitsuStart);
      kitsuError = err instanceof Error ? err.message : String(err);
      kitsuTimedOut = isTimeoutFailure(err);
    }
  }

  const resolvedFallbackCount =
    knownCount > 0
      ? knownCount
      : aniZipEpisodes.length > 0 ||
          jikanEpisodes.length > 0 ||
          kitsuEpisodes.length > 0 ||
          aniListStreaming.length > 0
        ? 0
        : targetMedia.format === 'MOVIE'
          ? 1
          : 12;

  const mergedEpisodes = mergeRealEpisodes({
    mediaId: targetMedia.id,
    expectedCount: resolvedFallbackCount,
    aniZipEpisodes,
    jikanEpisodes,
    kitsuEpisodes,
    aniListStreamingEpisodes: aniListStreaming,
    fallbackDurationSeconds: (targetMedia.duration || 24) * 60,
    fallbackThumbnail: targetMedia.banner || targetMedia.cover || null,
  });

  const providerSteps: EpisodeProviderStep[] = [
    {
      provider: 'AniZip',
      status:
        aniZipOutcome.status === 'hit' && aniZipEpisodes.length === 0 ? 'empty' : aniZipOutcome.status,
      durationMs: aniZipOutcome.durationMs,
      episodeCount: aniZipEpisodes.length,
      namedCount: aniZipEpisodes.filter((e) => !isGenericEpisodeTitle(e.title, e.number)).length,
      targetId: aniZipOutcome.targetId,
      sampleTitles: summarizeSampleTitles(aniZipEpisodes),
      note:
        aniZipEpisodes.length > 0
          ? `${aniZipEpisodes.length} parsed episodes${aniZipOutcome.fromCache ? ' (cached)' : ''}`
          : aniZipOutcome.note,
      errorMessage: aniZipOutcome.errorMessage ?? null,
    },
    {
      provider: 'AniList Streaming',
      status: aniListStreaming.length > 0 ? 'hit' : 'empty',
      durationMs: 0,
      episodeCount: aniListStreaming.length,
      namedCount: aniListStreaming.filter((e) => !isGenericEpisodeTitle(e.title, e.number)).length,
      targetId: targetMedia.id,
      sampleTitles: summarizeSampleTitles(aniListStreaming),
      note:
        aniListStreaming.length > 0
          ? `${aniListStreaming.length} streaming episodes embedded on AniList media`
          : '0 streamingEpisodes returned on AniList media',
    },
    {
      provider: 'Jikan (MAL)',
      status: !effectiveMalId
        ? 'skipped'
        : jikanError
          ? jikanTimedOut || isTimeoutFailure(jikanError)
            ? 'timeout'
            : 'error'
          : jikanEpisodes.length > 0
            ? 'hit'
            : 'empty',
      durationMs: jikanDuration,
      episodeCount: jikanEpisodes.length,
      namedCount: jikanEpisodes.filter((e) => !isGenericEpisodeTitle(e.title, e.number)).length,
      targetId: effectiveMalId,
      sampleTitles: summarizeSampleTitles(jikanEpisodes),
      note: !effectiveMalId
        ? 'Skipped (no MAL ID mapped)'
        : jikanEpisodes.length > 0
          ? `${jikanEpisodes.length} MAL episodes (${jikanEpisodes.filter((e) => e.isFiller).length} filler)`
          : jikanError
            ? jikanTimedOut
              ? 'Jikan API timed out (8500ms)'
              : 'Jikan API request failed'
            : 'Jikan returned 0 episode records',
      errorMessage: jikanError,
    },
    {
      provider: 'Kitsu',
      status: !kitsuId
        ? 'skipped'
        : !kitsuAttempted
          ? 'skipped'
          : kitsuError
            ? kitsuTimedOut || isTimeoutFailure(kitsuError)
              ? 'timeout'
              : 'error'
            : kitsuEpisodes.length > 0
              ? 'hit'
              : 'empty',
      durationMs: kitsuDuration,
      episodeCount: kitsuEpisodes.length,
      namedCount: kitsuEpisodes.filter((e) => !isGenericEpisodeTitle(e.title, e.number)).length,
      targetId: kitsuId ? String(kitsuId) : null,
      sampleTitles: summarizeSampleTitles(kitsuEpisodes),
      note: !kitsuId
        ? 'Skipped (no Kitsu ID mapped)'
        : !kitsuAttempted
          ? 'Skipped (higher-priority layers already supplied real titles)'
          : kitsuEpisodes.length > 0
            ? `${kitsuEpisodes.length} Kitsu episodes loaded`
            : kitsuError
              ? kitsuTimedOut
                ? 'Kitsu API timed out (8500ms)'
                : 'Kitsu API request failed'
              : 'Kitsu returned 0 episodes',
      errorMessage: kitsuError,
    },
  ];

  const sourceId = options?.sourceId || 'shonenx-hls-inbuilt';
  const sourceName =
    options?.sourceName ||
    INBUILT_SOURCES.find((s) => s.id === sourceId)?.name ||
    sourceId;

  const trace = analyzeEpisodeResolution({
    inputMedia: media,
    resolvedMedia: targetMedia,
    sourceId,
    sourceName,
    overrideTitle: overrideQuery,
    overrideMatched,
    resolvedExpectedCount: resolvedFallbackCount,
    providers: providerSteps,
    mergedEpisodes,
    totalDurationMs: Math.round(performance.now() - overallStart),
  });

  if (options?.recordTrace !== false) {
    recordEpisodeTrace(trace);
  }

  return { episodes: mergedEpisodes, trace };
}

export async function resolveEpisodesForMedia(
  media: UnifiedMedia,
  options?: {
    sourceId?: string;
    sourceName?: string;
    overrideTitle?: string;
    overrideMedia?: UnifiedMedia | null;
  },
): Promise<UnifiedEpisode[]> {
  const { episodes } = await resolveEpisodesWithDiagnostics(media, options);
  return episodes;
}

export function resolveChaptersForMedia(media: UnifiedMedia): UnifiedChapter[] {
  const count = media.chapters && media.chapters > 0 ? media.chapters : 24;
  return Array.from({ length: count }, (_, idx) => {
    const num = idx + 1;
    return {
      id: `${media.id}-ch-${num}`,
      number: num,
      title: `Chapter ${num}`,
      scanlator: num % 2 === 0 ? 'Official Release' : 'ShizuTv Scanlations',
      pageCount: 14,
    };
  });
}

export function resolveVideoServers(sourceId?: string, sourceName?: string): VideoServer[] {
  if (sourceId === 'hianime-bridge') {
    return [
      { id: 'hd-1-sub', name: 'HD-1 (Sub)', category: 'sub' },
      { id: 'hd-2-sub', name: 'HD-2 (Sub)', category: 'sub' },
      { id: 'hd-1-dub', name: 'HD-1 (Dub)', category: 'dub' },
    ];
  }
  if (sourceId && sourceId.startsWith('ext-')) {
    const label = sourceName ? `${sourceName.slice(0, 18)}` : 'Extension';
    return [
      { id: 'hd-1-sub', name: `${label} · HD-1 (Sub)`, category: 'sub' },
      { id: 'hd-2-sub', name: `${label} · HD-2 (Sub)`, category: 'sub' },
      { id: 'hd-1-dub', name: `${label} · HD-1 (Dub)`, category: 'dub' },
    ];
  }
  return [
    { id: 'hd-1-sub', name: 'HD-1 (Sub)', category: 'sub' },
    { id: 'hd-2-sub', name: 'HD-2 (Sub)', category: 'sub' },
    { id: 'hd-1-dub', name: 'HD-1 (Dub)', category: 'dub' },
  ];
}

export interface ResolveVideoStreamParams {
  media: UnifiedMedia;
  episode: UnifiedEpisode;
  server: VideoServer;
  sourceId?: string;
  sourceName?: string;
  sourceBaseUrl?: string;
  sourceLang?: string;
  audioLanguage?: 'ja' | 'en' | 'hi' | 'es';
  overrideTitle?: string;
  bypassCache?: boolean;
  signal?: AbortSignal;
}

export async function resolveVideoStreamAsync(
  params: ResolveVideoStreamParams,
): Promise<VideoStream> {
  const {
    media,
    episode,
    server,
    sourceId,
    sourceName,
    sourceBaseUrl,
    sourceLang,
    audioLanguage,
    overrideTitle,
    bypassCache,
    signal,
  } = params;

  const response = await fetch('/api/stream/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      mediaId: media.id,
      titles: {
        overrideTitle: overrideTitle?.trim() || null,
        english: media.title?.english ?? null,
        romaji: media.title?.romaji ?? null,
        native: media.title?.native ?? null,
        synonyms: media.synonyms ?? null,
      },
      format: media.format ?? null,
      episodeNumber: episode.number,
      serverId: server.id,
      serverName: server.name,
      category: server.category,
      audioLanguage,
      sourceId,
      sourceName,
      sourceBaseUrl,
      sourceLang,
      bypassCache: Boolean(bypassCache),
    }),
  });

  if (!response.ok) {
    let errMessage = `Failed to resolve episode stream (HTTP ${response.status}).`;
    try {
      const errData = (await response.json()) as { message?: string };
      if (errData?.message) errMessage = errData.message;
    } catch {
      // Ignore JSON parse error
    }
    throw new Error(errMessage);
  }

  const data = (await response.json()) as VideoStream;
  if (!data?.url) {
    throw new Error('Resolved stream payload did not include a playable URL.');
  }
  return data;
}

export interface ResolveMangaChaptersAsyncParams {
  media: UnifiedMedia;
  sourceId?: string;
  sourceName?: string;
  sourceBaseUrl?: string;
  sourceLang?: string;
  overrideTitle?: string;
  bypassCache?: boolean;
  signal?: AbortSignal;
}

export async function resolveMangaChaptersAsync(
  params: ResolveMangaChaptersAsyncParams,
): Promise<{ chapters: UnifiedChapter[]; matchedTitle?: string; sourceLabel?: string }> {
  const response = await fetch('/api/manga/chapters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: params.signal,
    body: JSON.stringify({
      mediaId: params.media.id,
      titles: {
        overrideTitle: params.overrideTitle?.trim() || null,
        english: params.media.title?.english ?? null,
        romaji: params.media.title?.romaji ?? null,
        native: params.media.title?.native ?? null,
        synonyms: params.media.synonyms ?? null,
      },
      sourceId: params.sourceId,
      sourceName: params.sourceName,
      sourceBaseUrl: params.sourceBaseUrl,
      sourceLang: params.sourceLang,
      bypassCache: Boolean(params.bypassCache),
    }),
  });

  if (!response.ok) {
    let errMessage = `Failed to load chapters (HTTP ${response.status}).`;
    try {
      const errData = (await response.json()) as { message?: string };
      if (errData?.message) errMessage = errData.message;
    } catch {
      // Ignore JSON parse error
    }
    throw new Error(errMessage);
  }

  const data = (await response.json()) as {
    chapters?: UnifiedChapter[];
    matchedTitle?: string;
    sourceLabel?: string;
  };
  if (!Array.isArray(data?.chapters) || data.chapters.length === 0) {
    throw new Error('No chapters found on this manga source.');
  }
  return {
    chapters: data.chapters,
    matchedTitle: data.matchedTitle,
    sourceLabel: data.sourceLabel,
  };
}

export interface ResolveMangaPagesAsyncParams {
  media: UnifiedMedia;
  chapter: UnifiedChapter;
  sourceId?: string;
  sourceName?: string;
  sourceBaseUrl?: string;
  sourceLang?: string;
  overrideTitle?: string;
  bypassCache?: boolean;
  signal?: AbortSignal;
}

export async function resolveMangaChapterPagesAsync(
  params: ResolveMangaPagesAsyncParams,
): Promise<{ pages: string[]; sourceLabel?: string }> {
  const response = await fetch('/api/manga/pages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: params.signal,
    body: JSON.stringify({
      mediaId: params.media.id,
      titles: {
        overrideTitle: params.overrideTitle?.trim() || null,
        english: params.media.title?.english ?? null,
        romaji: params.media.title?.romaji ?? null,
        native: params.media.title?.native ?? null,
        synonyms: params.media.synonyms ?? null,
      },
      chapter: {
        id: params.chapter.id,
        number: params.chapter.number,
        title: params.chapter.title,
        sourceChapterId: params.chapter.sourceChapterId,
        chapterUrl: params.chapter.chapterUrl,
      },
      sourceId: params.sourceId,
      sourceName: params.sourceName,
      sourceBaseUrl: params.sourceBaseUrl,
      sourceLang: params.sourceLang,
      bypassCache: Boolean(params.bypassCache),
    }),
  });

  if (!response.ok) {
    let errMessage = `Failed to load chapter pages (HTTP ${response.status}).`;
    try {
      const errData = (await response.json()) as { message?: string };
      if (errData?.message) errMessage = errData.message;
    } catch {
      // Ignore JSON parse error
    }
    throw new Error(errMessage);
  }

  const data = (await response.json()) as { pages?: string[]; sourceLabel?: string };
  if (!Array.isArray(data?.pages) || data.pages.length === 0) {
    throw new Error('No readable pages returned for this chapter.');
  }
  return {
    pages: data.pages,
    sourceLabel: data.sourceLabel,
  };
}

/**
 * Fallback placeholder pages used only when no live reader/chapter data is supplied.
 */
export function resolveChapterPages(media: UnifiedMedia, chapter: UnifiedChapter): string[] {
  const title = (media.title.english || media.title.romaji || 'Manga').replace(/[<>&"']/g, '');
  const totalPages = chapter.pageCount || 12;

  return Array.from({ length: totalPages }, (_, idx) => {
    const pageNum = idx + 1;
    const isCover = pageNum === 1;
    const bg = isCover ? '#12131a' : '#fafafa';
    const fg = isCover ? '#f8fafc' : '#111827';
    const accent = isCover ? '#e50914' : '#1e293b';

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200" viewBox="0 0 800 1200">
        <rect width="800" height="1200" fill="${bg}" />
        <rect x="28" y="28" width="744" height="1144" fill="none" stroke="${fg}" stroke-opacity="0.18" stroke-width="2" />
        ${
          isCover
            ? `
          <rect x="64" y="96" width="672" height="360" rx="8" fill="${accent}" fill-opacity="0.14" stroke="${accent}" stroke-width="2" />
          <text x="400" y="240" text-anchor="middle" font-family="Montserrat, sans-serif" font-size="38" font-weight="800" fill="${fg}">${title.slice(0, 28)}</text>
          <text x="400" y="295" text-anchor="middle" font-family="Montserrat, sans-serif" font-size="22" font-weight="600" fill="${accent}">CHAPTER ${chapter.number}</text>
          <text x="400" y="340" text-anchor="middle" font-family="Montserrat, sans-serif" font-size="16" fill="${fg}" fill-opacity="0.7">${chapter.title.replace(/[<>&"']/g, '')}</text>
        `
            : `
          <text x="400" y="590" text-anchor="middle" font-family="Montserrat, sans-serif" font-size="20" font-weight="700" fill="#334155">${title.slice(0, 32)} — Page ${pageNum} of ${totalPages}</text>
        `
        }
        <text x="400" y="1152" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="14" fill="${fg}" fill-opacity="0.5">${pageNum} / ${totalPages}</text>
      </svg>
    `.trim();

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

export function getMediaTypeCategory(type: MediaType): 'watching' | 'reading' {
  return type === 'MANGA' || type === 'NOVEL' ? 'reading' : 'watching';
}
