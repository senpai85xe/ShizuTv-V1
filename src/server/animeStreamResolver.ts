import crypto from 'node:crypto';
import { isSafeExternalHttpUrl } from '../utils/extensionRepoParser';
import {
  buildSearchQueriesForMedia,
  buildStreamProxyUrl,
  detectAvailableAudiosFromSources,
  extractMegaPlayStreamUrl,
  extractSlugFromGogoHref,
  GogoSearchCandidate,
  MappedSubtitleTrack,
  mapSubtitleTracksFromSources,
  ResolvedAvailableAudioOption,
  scoreGogoSearchCandidate,
} from '../utils/streamResolverUtils';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const PRIMARY_HOSTS = ['https://ww5.gogoanimes.fi', 'https://ww12.gogoanimes.fi'];
const MEGAPLAY_ENC_KEY = 'i?LMTAx0Q6,:}50U';
const MEGAPLAY_ENC_IV = "W0;27ToaUpl_P%'c";

export interface ResolveAnimeStreamParams {
  mediaId: string;
  titles: {
    overrideTitle?: string | null;
    english?: string | null;
    romaji?: string | null;
    native?: string | null;
    synonyms?: string[] | null;
  };
  format?: string | null;
  episodeNumber: number;
  serverId?: string;
  serverName?: string;
  category?: 'sub' | 'dub' | 'raw';
  sourceId?: string;
  sourceName?: string;
  sourceBaseUrl?: string;
  bypassCache?: boolean;
}

export interface ResolvedAnimeStreamPayload {
  url: string;
  rawUrl: string;
  quality: string;
  isHls: boolean;
  serverName: string;
  provider: string;
  matchedTitle: string;
  matchedSlug: string;
  matchedEpisode: number;
  referer: string;
  subtitles: MappedSubtitleTrack[];
  availableAudios: ResolvedAvailableAudioOption[];
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
  mirrors: Array<{
    url: string;
    quality: string;
    isHls: boolean;
    serverName: string;
  }>;
}

const resolvedStreamCache = new Map<
  string,
  { expiresAt: number; payload: ResolvedAnimeStreamPayload }
>();
const CACHE_TTL_MS = 5 * 60_000;

function padKeyBytes(str: string, len: number): Buffer {
  const buf = Buffer.alloc(len, 0);
  const src = Buffer.from(str, 'utf8');
  src.copy(buf, 0, 0, Math.min(len, src.length));
  return buf;
}

export function decryptMegaPlayEnc(enc: string): unknown {
  let b64 = String(enc || '')
    .trim()
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const mod = b64.length % 4;
  if (mod !== 0) {
    b64 += '===='.slice(mod);
  }
  const key = padKeyBytes(MEGAPLAY_ENC_KEY, 32);
  const iv = padKeyBytes(MEGAPLAY_ENC_IV, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(b64, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8'));
}

async function fetchText(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 8500,
): Promise<{ status: number; ok: boolean; url: string; text: string }> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml,application/json,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      ...headers,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, url: res.url || url, text };
}

function parseGogoSearchHtml(html: string): GogoSearchCandidate[] {
  const results: GogoSearchCandidate[] = [];
  const seen = new Set<string>();
  const re = /<p\s+class="name">\s*<a\s+href="([^"]+)"[^>]*title="([^"]*)"/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const href = match[1].trim();
    const title = match[2]
      .replace(/&amp;/g, '&')
      .replace(/&#039;/g, "'")
      .replace(/&rsquo;/g, '’')
      .replace(/&quot;/g, '"')
      .trim();
    if (!href || seen.has(href)) continue;
    seen.add(href);
    results.push({ href, title });
  }
  return results;
}

function parseGogoEpisodeEmbeds(html: string): Array<{ label: string; url: string }> {
  const embeds: Array<{ label: string; url: string }> = [];
  const seen = new Set<string>();

  const liRe = /<li[^>]*>\s*<a[^>]*data-video="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = liRe.exec(html)) !== null) {
    const rawUrl = match[1].trim().replace(/&amp;/g, '&');
    if (!rawUrl || seen.has(rawUrl)) continue;
    seen.add(rawUrl);
    const labelRaw = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const label = labelRaw.split(' ')[0] || `Server ${embeds.length + 1}`;
    embeds.push({ label, url: rawUrl });
  }

  if (embeds.length === 0) {
    const fallbackRe = /data-video="([^"]+)"/gi;
    while ((match = fallbackRe.exec(html)) !== null) {
      const rawUrl = match[1].trim().replace(/&amp;/g, '&');
      if (!rawUrl || seen.has(rawUrl)) continue;
      seen.add(rawUrl);
      embeds.push({ label: `Server ${embeds.length + 1}`, url: rawUrl });
    }
  }

  if (embeds.length === 0) {
    const iframeMatch = html.match(/<iframe[^>]+src="([^"]+newplayer\.php[^"]+)"/i);
    if (iframeMatch?.[1]) {
      embeds.push({ label: 'HD-1', url: iframeMatch[1].replace(/&amp;/g, '&') });
    }
  }

  return embeds;
}

async function resolveEmbedIframeUrl(
  embedUrl: string,
  episodePageUrl: string,
): Promise<string | null> {
  if (!isSafeExternalHttpUrl(embedUrl)) return null;
  try {
    const parsed = new URL(embedUrl);
    if (parsed.hostname.includes('megaplay.buzz') || parsed.hostname.includes('vidwish.live')) {
      return embedUrl;
    }
    const page = await fetchText(embedUrl, { Referer: episodePageUrl }, 8000);
    if (!page.ok) return null;
    const iframeMatch = page.text.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (!iframeMatch?.[1]) return null;
    return new URL(iframeMatch[1].replace(/&amp;/g, '&'), page.url).toString();
  } catch {
    return null;
  }
}

async function resolveMegaPlayOrCompatibleIframe(
  iframeUrl: string,
  preferredCategory: 'sub' | 'dub' | 'raw',
  embedReferer: string,
): Promise<{
  streamUrl: string;
  referer: string;
  subtitles: MappedSubtitleTrack[];
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
} | null> {
  if (!isSafeExternalHttpUrl(iframeUrl)) return null;

  // Adjust /sub vs /dub path cleanly if compatible stream player
  let candidateUrl = iframeUrl;
  if (preferredCategory === 'dub' && /\/sub(?:[?#]|$)/i.test(candidateUrl)) {
    candidateUrl = candidateUrl.replace(/\/sub([?#]|$)/i, '/dub$1');
  } else if (preferredCategory === 'sub' && /\/dub(?:[?#]|$)/i.test(candidateUrl)) {
    candidateUrl = candidateUrl.replace(/\/dub([?#]|$)/i, '/sub$1');
  }

  const attempt = async (targetUrl: string) => {
    const parsed = new URL(targetUrl);
    const origin = `${parsed.protocol}//${parsed.host}`;
    const res = await fetchText(targetUrl, { Referer: embedReferer }, 8500);
    if (!res.ok) return null;

    const dataId =
      res.text.match(/data-id=["']([^"']+)["']/i)?.[1] ||
      res.text.match(/data-realid=["']([^"']+)["']/i)?.[1];
    if (!dataId) return null;

    const getSourcesUrl = `${origin}/stream/getSources?id=${encodeURIComponent(dataId)}`;
    const srcRes = await fetchText(
      getSourcesUrl,
      {
        Referer: targetUrl,
        Origin: origin,
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json, text/plain, */*',
      },
      8500,
    );
    if (!srcRes.ok) return null;

    let json: Record<string, unknown>;
    try {
      json = JSON.parse(srcRes.text) as Record<string, unknown>;
    } catch {
      return null;
    }

    let decrypted: unknown = json.sources ?? null;
    if (!decrypted && typeof json.enc === 'string' && json.enc.trim()) {
      try {
        decrypted = decryptMegaPlayEnc(json.enc);
      } catch {
        return null;
      }
    }

    const rawStreamUrl = extractMegaPlayStreamUrl(decrypted);
    if (!rawStreamUrl || !isSafeExternalHttpUrl(rawStreamUrl)) return null;

    const refererHeader = `${origin}/`;
    const subtitles = mapSubtitleTracksFromSources(
      Array.isArray(json.tracks) ? json.tracks : [],
      '/api/stream/proxy',
      refererHeader,
    );

    const parseInterval = (raw: unknown): { start: number; end: number } | null => {
      if (!raw || typeof raw !== 'object') return null;
      const obj = raw as Record<string, unknown>;
      const start = Number(obj.start);
      const end = Number(obj.end);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        return { start, end };
      }
      return null;
    };

    return {
      streamUrl: rawStreamUrl,
      referer: refererHeader,
      subtitles,
      intro: parseInterval(json.intro),
      outro: parseInterval(json.outro),
    };
  };

  const primaryAttempt = await attempt(candidateUrl);
  if (primaryAttempt) return primaryAttempt;

  // If dub didn't exist on that iframe path, don't silently return sub when user asked for dub unless called as fallback
  return null;
}

async function searchGogoAcrossQueries(
  host: string,
  queries: string[],
  targetTitles: string[],
  category: 'sub' | 'dub' | 'raw',
  format?: string | null,
): Promise<Array<GogoSearchCandidate & { score: number }>> {
  const allCandidates = new Map<string, GogoSearchCandidate>();

  for (const query of queries) {
    try {
      const searchUrl = `${host}/search.html?keyword=${encodeURIComponent(query)}`;
      const res = await fetchText(searchUrl, { Referer: `${host}/` }, 7000);
      if (!res.ok) continue;

      const parsed = parseGogoSearchHtml(res.text);
      for (const item of parsed) {
        if (!allCandidates.has(item.href)) {
          allCandidates.set(item.href, item);
        }
      }

      if (allCandidates.size > 0) {
        const rankedNow = Array.from(allCandidates.values())
          .map((c) => ({
            ...c,
            score: scoreGogoSearchCandidate(c, { titles: targetTitles, category, format }),
          }))
          .sort((a, b) => b.score - a.score);
        // Stop early once we have a confident match
        if (rankedNow[0] && rankedNow[0].score >= 85) {
          return rankedNow;
        }
      }
    } catch {
      // Try next query
    }
  }

  return Array.from(allCandidates.values())
    .map((c) => ({
      ...c,
      score: scoreGogoSearchCandidate(c, { titles: targetTitles, category, format }),
    }))
    .sort((a, b) => b.score - a.score);
}

async function resolveEpisodePageUrls(
  host: string,
  slug: string,
  episodeNumber: number,
): Promise<string[]> {
  const candidates: string[] = [];
  const pushUrl = (u: string) => {
    if (!candidates.includes(u)) candidates.push(u);
  };

  const epNumStr = Number.isInteger(episodeNumber)
    ? String(episodeNumber)
    : String(episodeNumber).replace('.', '-');
  pushUrl(`${host}/${slug}-episode-${epNumStr}`);

  // Also check category page if direct URL misses (e.g. non-standard episode slug or movie)
  try {
    const catRes = await fetchText(`${host}/category/${slug}`, { Referer: `${host}/` }, 6500);
    if (catRes.ok) {
      const html = catRes.text;
      const inlineMatches = [...html.matchAll(/href="\s*(\/[^"]+-episode-[0-9.-]+)\s*"/gi)].map(
        (m) => m[1].trim(),
      );
      const targetMatch = inlineMatches.find((href) =>
        new RegExp(`-episode-${epNumStr}(?:$|\\?)`, 'i').test(href),
      );
      if (targetMatch) {
        pushUrl(`${host}${targetMatch.startsWith('/') ? '' : '/'}${targetMatch}`);
      }

      const movieId =
        html.match(/id="movie_id"[^>]*value="([^"]+)"/i)?.[1] ||
        html.match(/value="([^"]+)"[^>]*id="movie_id"/i)?.[1];
      if (movieId && !targetMatch) {
        const start = Math.max(0, Math.floor(episodeNumber) - 5);
        const end = Math.max(start + 100, Math.floor(episodeNumber) + 15);
        const ajaxRes = await fetchText(
          `${host}/ajax/load-list-episode?ep_start=${start}&ep_end=${end}&id=${encodeURIComponent(movieId)}`,
          { Referer: `${host}/category/${slug}` },
          6500,
        );
        if (ajaxRes.ok) {
          const ajaxMatches = [
            ...ajaxRes.text.matchAll(/href="\s*(\/[^"]+-episode-[0-9.-]+)\s*"/gi),
          ].map((m) => m[1].trim());
          const exactAjax = ajaxMatches.find((href) =>
            new RegExp(`-episode-${epNumStr}(?:$|\\?)`, 'i').test(href),
          );
          if (exactAjax) {
            // ajax endpoint sometimes omits slug prefix (e.g. "/-episode-1")
            const fixed = exactAjax.startsWith('/-episode-')
              ? `/${slug}${exactAjax.slice(1)}`
              : exactAjax;
            pushUrl(`${host}${fixed.startsWith('/') ? '' : '/'}${fixed}`);
          } else if (episodeNumber === 1 && ajaxMatches[ajaxMatches.length - 1]) {
            const firstHref = ajaxMatches[ajaxMatches.length - 1];
            const fixed = firstHref.startsWith('/-episode-')
              ? `/${slug}${firstHref.slice(1)}`
              : firstHref;
            pushUrl(`${host}${fixed.startsWith('/') ? '' : '/'}${fixed}`);
          }
        }
      }
    }
  } catch {
    // Keep direct URL candidate
  }

  return candidates;
}

export async function resolveAnimeEpisodeStream(
  params: ResolveAnimeStreamParams,
): Promise<ResolvedAnimeStreamPayload> {
  const safeEpisodeNum =
    Number.isFinite(params.episodeNumber) && params.episodeNumber > 0
      ? params.episodeNumber
      : 1;
  const category: 'sub' | 'dub' | 'raw' =
    params.category === 'dub' || params.serverId?.includes('dub') ? 'dub' : 'sub';

  const cacheKey = JSON.stringify({
    mediaId: params.mediaId,
    override: params.titles.overrideTitle || '',
    en: params.titles.english || '',
    ro: params.titles.romaji || '',
    ep: safeEpisodeNum,
    category,
    serverId: params.serverId || '',
    sourceId: params.sourceId || '',
  });

  if (!params.bypassCache) {
    const cached = resolvedStreamCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.payload;
    }
  }

  const queries = buildSearchQueriesForMedia(params.titles);
  if (queries.length === 0) {
    throw new Error('No searchable anime title available to resolve episode stream.');
  }

  const targetTitles = [
    params.titles.overrideTitle,
    params.titles.english,
    params.titles.romaji,
    ...(params.titles.synonyms || []),
  ]
    .map((t) => (typeof t === 'string' ? t.trim() : ''))
    .filter(Boolean);

  // Build ordered list of compatible provider hosts
  const hostsToTry: string[] = [];
  if (
    params.sourceBaseUrl &&
    isSafeExternalHttpUrl(params.sourceBaseUrl) &&
    /gogo|anitaku/i.test(params.sourceBaseUrl)
  ) {
    hostsToTry.push(params.sourceBaseUrl.replace(/\/+$/, ''));
  }
  for (const h of PRIMARY_HOSTS) {
    if (!hostsToTry.includes(h)) hostsToTry.push(h);
  }

  let lastError = 'No working episode stream mirror responded.';

  for (const host of hostsToTry) {
    const candidates = await searchGogoAcrossQueries(
      host,
      queries,
      targetTitles,
      category,
      params.format,
    );

    if (candidates.length === 0) {
      lastError = `No matching anime entries found on stream host for "${queries[0]}".`;
      continue;
    }

    // Try top matching slugs (especially helpful when Sub vs Dub uses distinct slug vs iframe switch)
    const slugsToTry = candidates.slice(0, 3);
    for (const candidate of slugsToTry) {
      const slug = extractSlugFromGogoHref(candidate.href);
      if (!slug) continue;

      const episodeUrls = await resolveEpisodePageUrls(host, slug, safeEpisodeNum);
      for (const epUrl of episodeUrls) {
        let epHtml = '';
        try {
          const epRes = await fetchText(epUrl, { Referer: `${host}/` }, 8000);
          if (!epRes.ok) continue;
          epHtml = epRes.text;
        } catch {
          continue;
        }

        const embeds = parseGogoEpisodeEmbeds(epHtml);
        if (embeds.length === 0) continue;

        // Order embeds based on requested server (e.g. hd-2 first if selected)
        const preferHd2 =
          params.serverId === 'hd-2-sub' ||
          params.serverId === 'direct-mp4' ||
          /hd-2/i.test(params.serverName || '');
        const orderedEmbeds = preferHd2 && embeds.length > 1
          ? [embeds[1], embeds[0], ...embeds.slice(2)]
          : embeds;

        let hasDubProbe = false;
        let resolvedMirrors: Array<{
          streamUrl: string;
          referer: string;
          label: string;
          subtitles: MappedSubtitleTrack[];
          intro: { start: number; end: number } | null;
          outro: { start: number; end: number } | null;
        }> = [];

        const initialAudiosWithoutProbe = detectAvailableAudiosFromSources({
          candidates,
          targetTitles,
          currentCategory: category,
          hasDubProbe: false,
        });
        const alreadyHasDubCandidate = initialAudiosWithoutProbe.some((a) => a.code === 'en');

        for (const emb of orderedEmbeds.slice(0, 3)) {
          const iframeUrl = await resolveEmbedIframeUrl(emb.url, epUrl);
          if (!iframeUrl) continue;

          const shouldProbeDubInParallel =
            resolvedMirrors.length === 0 &&
            category === 'sub' &&
            !alreadyHasDubCandidate &&
            /\/(?:sub|dub)(?:[?#]|$)/i.test(iframeUrl);

          const [primaryMedia, dubProbeMedia] = await Promise.all([
            resolveMegaPlayOrCompatibleIframe(iframeUrl, category, emb.url),
            shouldProbeDubInParallel
              ? resolveMegaPlayOrCompatibleIframe(iframeUrl, 'dub', emb.url).catch(() => null)
              : Promise.resolve(null),
          ]);

          if (dubProbeMedia?.streamUrl) {
            hasDubProbe = true;
          }

          let mediaData = primaryMedia;
          // Fallback to /sub if dub path isn't hosted yet on this mirror and candidate slug itself isn't -dub
          if (!mediaData && category === 'dub' && !/-dub$/i.test(slug)) {
            continue;
          }
          if (!mediaData) {
            mediaData = await resolveMegaPlayOrCompatibleIframe(iframeUrl, 'sub', emb.url);
          }

          if (mediaData) {
            resolvedMirrors.push({
              ...mediaData,
              label: emb.label,
            });
            // Once primary requested server succeeds, we already have a working stream; collect up to 2 mirrors quickly
            if (resolvedMirrors.length >= 2) break;
          }
        }

        if (resolvedMirrors.length > 0) {
          const primary = resolvedMirrors[0];
          const isHls = /\.m3u8(?:$|\?)/i.test(primary.streamUrl) || !/\.mp4(?:$|\?)/i.test(primary.streamUrl);
          const proxiedUrl = buildStreamProxyUrl(
            primary.streamUrl,
            '/api/stream/proxy',
            primary.referer,
          );
          const availableAudios = detectAvailableAudiosFromSources({
            candidates,
            targetTitles,
            currentCategory: category,
            hasDubProbe,
          });

          const payload: ResolvedAnimeStreamPayload = {
            url: proxiedUrl,
            rawUrl: primary.streamUrl,
            quality: isHls ? '1080p HLS' : '720p MP4',
            isHls,
            serverName:
              params.serverName ||
              `${params.sourceName || 'ShizuTv'} · ${primary.label} (${category.toUpperCase()})`,
            provider: params.sourceName || 'ShizuTv Stream Engine',
            matchedTitle: candidate.title || queries[0],
            matchedSlug: slug,
            matchedEpisode: safeEpisodeNum,
            referer: primary.referer,
            subtitles: primary.subtitles,
            availableAudios,
            intro: primary.intro,
            outro: primary.outro,
            mirrors: resolvedMirrors.map((m) => {
              const mIsHls =
                /\.m3u8(?:$|\?)/i.test(m.streamUrl) || !/\.mp4(?:$|\?)/i.test(m.streamUrl);
              return {
                url: buildStreamProxyUrl(m.streamUrl, '/api/stream/proxy', m.referer),
                quality: mIsHls ? '1080p HLS' : '720p MP4',
                isHls: mIsHls,
                serverName: `${m.label} (${category.toUpperCase()})`,
              };
            }),
          };

          resolvedStreamCache.set(cacheKey, {
            expiresAt: Date.now() + CACHE_TTL_MS,
            payload,
          });
          return payload;
        }
      }
    }
  }

  throw new Error(lastError);
}
