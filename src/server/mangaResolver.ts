import type { UnifiedChapter } from '../types/media.ts';
import { isSafeExternalHttpUrl } from '../utils/extensionRepoParser.ts';
import {
  buildMangaDexAtHomePages,
  buildMangaTitleQueryList,
  MANGADEX_API_BASE,
  type MangaDexFeedChapter,
  type MangaDexSearchItem,
  mapMangaDexChapterFeed,
  parseMangaChapterListHtml,
  parseMangaPagesHtml,
  parseMangaSearchHtml,
  pickBestMangaDexMatch,
  resolveMangaHostPlan,
} from '../utils/mangaResolverUtils.ts';
import {
  isMetadataOnlyCatalogHost,
  isViableTitleMatch,
  scoreGogoSearchCandidate,
} from '../utils/streamResolverUtils.ts';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MANGADEX_UA = 'ShizuTv/2.1 (+https://mangadex.org)';

export interface ResolveMangaChaptersParams {
  mediaId: string;
  titles: {
    overrideTitle?: string | null;
    english?: string | null;
    romaji?: string | null;
    native?: string | null;
    synonyms?: string[] | null;
  };
  sourceId?: string;
  sourceName?: string;
  sourceBaseUrl?: string;
  sourceLang?: string;
  bypassCache?: boolean;
}

export interface ResolvedMangaChaptersResult {
  chapters: Array<
    UnifiedChapter & {
      sourceChapterId?: string;
      chapterUrl?: string;
      externalUrl?: string | null;
    }
  >;
  matchedTitle: string;
  sourceLabel: string;
  provider: 'mangadex' | 'custom-extension';
}

export interface ResolveMangaPagesParams {
  mediaId: string;
  titles: {
    overrideTitle?: string | null;
    english?: string | null;
    romaji?: string | null;
    native?: string | null;
    synonyms?: string[] | null;
  };
  chapter: {
    id?: string;
    number: number;
    title?: string;
    sourceChapterId?: string;
    chapterUrl?: string;
  };
  sourceId?: string;
  sourceName?: string;
  sourceBaseUrl?: string;
  sourceLang?: string;
  bypassCache?: boolean;
}

export interface ResolvedMangaPagesResult {
  pages: string[];
  chapterNumber: number;
  chapterTitle: string;
  sourceLabel: string;
  provider: 'mangadex' | 'custom-extension';
}

const chaptersCache = new Map<
  string,
  { expiresAt: number; payload: ResolvedMangaChaptersResult }
>();
const pagesCache = new Map<
  string,
  { expiresAt: number; payload: ResolvedMangaPagesResult }
>();
const CACHE_TTL_MS = 5 * 60_000;

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'application/json',
      ...headers,
    },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) {
    throw new Error(`Upstream returned HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

async function fetchHtml(
  url: string,
  headers: Record<string, string> = {},
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; url: string; text: string }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml,application/json,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      ...headers,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(9000),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, url: res.url || url, text };
}

async function resolveMangaDexChapters(
  queries: string[],
  sourceLabel: string,
  sourceLang?: string,
): Promise<ResolvedMangaChaptersResult> {
  let matched: { id: string; matchedTitle: string } | null = null;

  for (const query of queries.slice(0, 4)) {
    try {
      const searchUrl = `${MANGADEX_API_BASE}/manga?title=${encodeURIComponent(query)}&limit=20&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`;
      const searchJson = await fetchJson<{ data?: MangaDexSearchItem[] }>(searchUrl, {
        'User-Agent': MANGADEX_UA,
      });
      const best = pickBestMangaDexMatch(searchJson.data || [], queries);
      if (best) {
        matched = { id: best.id, matchedTitle: best.matchedTitle };
        break;
      }
    } catch {
      // Try next query
    }
  }

  if (!matched) {
    throw new Error(`No matching manga found on MangaDex for "${queries[0] || 'this title'}".`);
  }

  const normalizedLang = (sourceLang || '').trim().toLowerCase();
  const useLangFilter =
    normalizedLang && normalizedLang !== 'multi' && normalizedLang !== 'all'
      ? normalizedLang
      : 'en';

  const buildFeedUrl = (langCode?: string) => {
    const params = new URLSearchParams({
      limit: '500',
      'order[chapter]': 'asc',
    });
    params.append('includes[]', 'scanlation_group');
    params.append('contentRating[]', 'safe');
    params.append('contentRating[]', 'suggestive');
    params.append('contentRating[]', 'erotica');
    if (langCode) {
      params.append('translatedLanguage[]', langCode);
    }
    return `${MANGADEX_API_BASE}/manga/${encodeURIComponent(matched!.id)}/feed?${params.toString()}`;
  };

  let feedRes = await fetchJson<{ data?: MangaDexFeedChapter[] }>(buildFeedUrl(useLangFilter), {
    'User-Agent': MANGADEX_UA,
  });
  let mapped = mapMangaDexChapterFeed(feedRes.data || []);

  if (mapped.length === 0) {
    feedRes = await fetchJson<{ data?: MangaDexFeedChapter[] }>(buildFeedUrl(undefined), {
      'User-Agent': MANGADEX_UA,
    });
    mapped = mapMangaDexChapterFeed(feedRes.data || []);
  }

  if (mapped.length === 0) {
    throw new Error(
      `MangaDex found "${matched.matchedTitle}", but no readable chapters are hosted on MangaDex (chapters may be external publisher links only). Try another manga extension.`,
    );
  }

  return {
    chapters: mapped,
    matchedTitle: matched.matchedTitle,
    sourceLabel,
    provider: 'mangadex',
  };
}

async function resolveCustomExtensionMangaChapters(
  baseUrl: string,
  queries: string[],
  sourceLabel: string,
): Promise<ResolvedMangaChaptersResult> {
  if (!isSafeExternalHttpUrl(baseUrl)) {
    throw new Error(`Invalid base URL configured for ${sourceLabel}.`);
  }
  if (isMetadataOnlyCatalogHost(baseUrl, sourceLabel)) {
    throw new Error(
      `${sourceLabel} is a metadata catalog and does not host manga chapters. Switch to MangaDex (Bridge) or a manga reader extension.`,
    );
  }

  const allCandidates = new Map<string, { href: string; title: string }>();

  for (const query of queries.slice(0, 4)) {
    const endpoints = [
      `${baseUrl}/?s=${encodeURIComponent(query)}&post_type=wp-manga`,
      `${baseUrl}/?s=${encodeURIComponent(query)}`,
      `${baseUrl}/search?q=${encodeURIComponent(query)}`,
      `${baseUrl}/search?keyword=${encodeURIComponent(query)}`,
    ];

    for (const ep of endpoints) {
      try {
        const res = await fetchHtml(ep, { Referer: `${baseUrl}/` });
        if (!res.ok) continue;
        const parsed = parseMangaSearchHtml(res.text, res.url || baseUrl);
        for (const item of parsed) {
          if (!allCandidates.has(item.href)) {
            allCandidates.set(item.href, item);
          }
        }
        if (parsed.length > 0) break;
      } catch {
        // Try next search pattern
      }
    }
    if (allCandidates.size > 0) break;
  }

  const viable = Array.from(allCandidates.values())
    .filter((c) => isViableTitleMatch(c, queries, 'MANGA'))
    .map((c) => ({
      ...c,
      score: scoreGogoSearchCandidate(c, {
        titles: queries,
        category: 'sub',
        format: 'MANGA',
      }),
    }))
    .sort((a, b) => b.score - a.score);

  if (viable.length === 0) {
    throw new Error(`No matching manga found on ${sourceLabel} for "${queries[0] || 'this title'}".`);
  }

  for (const cand of viable.slice(0, 3)) {
    const seriesUrl = new URL(cand.href, baseUrl).toString();
    try {
      const pageRes = await fetchHtml(seriesUrl, { Referer: `${baseUrl}/` });
      if (!pageRes.ok) continue;

      let chapters = parseMangaChapterListHtml(pageRes.text, pageRes.url || seriesUrl);
      // Madara WordPress themes load chapters lazily via POST {seriesUrl}/ajax/chapters/
      if (chapters.length === 0) {
        try {
          const ajaxUrl = `${seriesUrl.replace(/\/+$/, '')}/ajax/chapters/`;
          const ajaxRes = await fetchHtml(
            ajaxUrl,
            {
              Referer: seriesUrl,
              'X-Requested-With': 'XMLHttpRequest',
            },
            { method: 'POST' },
          );
          if (ajaxRes.ok && ajaxRes.text) {
            chapters = parseMangaChapterListHtml(ajaxRes.text, seriesUrl);
          }
        } catch {
          // Ignore Madara ajax chapters failure
        }
      }

      if (chapters.length > 0) {
        return {
          chapters,
          matchedTitle: cand.title,
          sourceLabel,
          provider: 'custom-extension',
        };
      }
    } catch {
      // Try next viable candidate
    }
  }

  throw new Error(
    `Found "${viable[0].title}" on ${sourceLabel}, but could not load its chapter list.`,
  );
}

export async function resolveMangaChaptersServer(
  params: ResolveMangaChaptersParams,
): Promise<ResolvedMangaChaptersResult> {
  const plan = resolveMangaHostPlan(params);
  if (plan.mode === 'missing-host') {
    throw new Error(
      `Extension "${plan.sourceLabel}" does not have a valid base URL configured. Open Extensions settings to verify or reinstall it.`,
    );
  }

  const queries = buildMangaTitleQueryList(params.titles);
  if (queries.length === 0) {
    throw new Error('No searchable manga title available.');
  }

  const cacheKey = JSON.stringify({
    mediaId: params.mediaId,
    q: queries[0],
    sourceId: params.sourceId || 'mangadex-bridge',
    baseUrl: params.sourceBaseUrl || '',
    lang: params.sourceLang || '',
  });

  if (!params.bypassCache) {
    const cached = chaptersCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.payload;
    }
  }

  const result =
    plan.mode === 'mangadex'
      ? await resolveMangaDexChapters(queries, plan.sourceLabel, params.sourceLang)
      : await resolveCustomExtensionMangaChapters(plan.baseUrl!, queries, plan.sourceLabel);

  chaptersCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload: result });
  return result;
}

export async function resolveMangaChapterPagesServer(
  params: ResolveMangaPagesParams,
): Promise<ResolvedMangaPagesResult> {
  const plan = resolveMangaHostPlan(params);
  if (plan.mode === 'missing-host') {
    throw new Error(
      `Extension "${plan.sourceLabel}" does not have a valid base URL configured.`,
    );
  }

  const cacheKey = JSON.stringify({
    mediaId: params.mediaId,
    chNum: params.chapter.number,
    chId: params.chapter.sourceChapterId || params.chapter.id || '',
    chUrl: params.chapter.chapterUrl || '',
    sourceId: params.sourceId || 'mangadex-bridge',
    baseUrl: params.sourceBaseUrl || '',
  });

  if (!params.bypassCache) {
    const cached = pagesCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.payload;
    }
  }

  if (plan.mode === 'mangadex') {
    let mdChapterId =
      params.chapter.sourceChapterId ||
      (params.chapter.id?.startsWith('md-') ? params.chapter.id.slice(3) : '');

    if (!mdChapterId) {
      const chResult = await resolveMangaChaptersServer({
        mediaId: params.mediaId,
        titles: params.titles,
        sourceId: params.sourceId,
        sourceName: params.sourceName,
        sourceBaseUrl: params.sourceBaseUrl,
        sourceLang: params.sourceLang,
        bypassCache: params.bypassCache,
      });
      const matchedCh =
        chResult.chapters.find((c) => c.number === params.chapter.number) || chResult.chapters[0];
      mdChapterId =
        matchedCh?.sourceChapterId ||
        (matchedCh?.id?.startsWith('md-') ? matchedCh.id.slice(3) : '');
    }

    if (!mdChapterId) {
      throw new Error(`Chapter ${params.chapter.number} was not found on MangaDex.`);
    }

    const atHomeJson = await fetchJson<{
      baseUrl?: string;
      chapter?: { hash?: string; data?: string[]; dataSaver?: string[] };
    }>(`${MANGADEX_API_BASE}/at-home/server/${encodeURIComponent(mdChapterId)}`, {
      'User-Agent': MANGADEX_UA,
    });

    const pages = buildMangaDexAtHomePages(atHomeJson, '/api/stream/proxy');
    if (pages.length === 0) {
      throw new Error(`No readable image pages returned by MangaDex for Chapter ${params.chapter.number}.`);
    }

    const payload: ResolvedMangaPagesResult = {
      pages,
      chapterNumber: params.chapter.number,
      chapterTitle: params.chapter.title || `Chapter ${params.chapter.number}`,
      sourceLabel: plan.sourceLabel,
      provider: 'mangadex',
    };
    pagesCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
    return payload;
  }

  // Custom manga extension
  let chapterUrl = params.chapter.chapterUrl;
  if (!chapterUrl) {
    const chResult = await resolveMangaChaptersServer({
      mediaId: params.mediaId,
      titles: params.titles,
      sourceId: params.sourceId,
      sourceName: params.sourceName,
      sourceBaseUrl: params.sourceBaseUrl,
      sourceLang: params.sourceLang,
      bypassCache: params.bypassCache,
    });
    const matchedCh =
      chResult.chapters.find((c) => c.number === params.chapter.number) || chResult.chapters[0];
    chapterUrl = matchedCh?.chapterUrl;
  }

  if (!chapterUrl || !isSafeExternalHttpUrl(chapterUrl)) {
    throw new Error(
      `Chapter ${params.chapter.number} URL could not be located on ${plan.sourceLabel}.`,
    );
  }

  const res = await fetchHtml(chapterUrl, { Referer: `${plan.baseUrl}/` });
  if (!res.ok) {
    throw new Error(
      `${plan.sourceLabel} returned HTTP ${res.status} while loading Chapter ${params.chapter.number}.`,
    );
  }

  const pages = parseMangaPagesHtml(res.text, res.url || chapterUrl, '/api/stream/proxy');
  if (pages.length === 0) {
    throw new Error(
      `No readable page images found on ${plan.sourceLabel} for Chapter ${params.chapter.number}. Try switching to MangaDex (Bridge) or another manga extension.`,
    );
  }

  const payload: ResolvedMangaPagesResult = {
    pages,
    chapterNumber: params.chapter.number,
    chapterTitle: params.chapter.title || `Chapter ${params.chapter.number}`,
    sourceLabel: plan.sourceLabel,
    provider: 'custom-extension',
  };
  pagesCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
  return payload;
}
