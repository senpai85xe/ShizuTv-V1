import crypto from 'node:crypto';
import { isSafeExternalHttpUrl } from '../utils/extensionRepoParser.ts';
import {
  buildSearchQueriesForMedia,
  buildStreamProxyUrl,
  buildStreamResolverCacheKey,
  detectAvailableAudiosFromSources,
  extractDirectVideoUrlFromHtmlOrScript,
  extractMegaPlayStreamUrl,
  extractSlugFromGogoHref,
  type GenericEmbedCandidate,
  type GogoSearchCandidate,
  HIANIME_BRIDGE_HOSTS,
  isMetadataOnlyCatalogHost,
  isSourceInherentLanguage,
  isViableTitleMatch,
  type MappedSubtitleTrack,
  mapSubtitleTracksFromSources,
  parseGenericEmbedCandidates,
  parseGenericEpisodeLinks,
  parseGenericSearchHtml,
  type ResolvedAvailableAudioOption,
  resolveProviderHostPlan,
  scoreGogoSearchCandidate,
  sortEmbedsForAudioLanguage,
  type StreamAudioLanguage,
} from '../utils/streamResolverUtils.ts';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

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
  audioLanguage?: StreamAudioLanguage;
  sourceId?: string;
  sourceName?: string;
  sourceBaseUrl?: string;
  sourceLang?: string;
  bypassCache?: boolean;
}

export interface ResolvedAnimeStreamPayload {
  url: string;
  rawUrl: string;
  quality: string;
  isHls: boolean;
  serverName: string;
  provider: string;
  sourceId?: string;
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

function normalizeHttpUrl(rawUrl: string, baseUrl: string): string | null {
  try {
    const resolved = new URL(rawUrl.trim().replace(/&amp;/g, '&'), baseUrl).toString();
    return isSafeExternalHttpUrl(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

async function parseDooPlayAjaxEmbeds(
  html: string,
  episodePageUrl: string,
): Promise<GenericEmbedCandidate[]> {
  const embeds: GenericEmbedCandidate[] = [];
  const dooRe =
    /<li[^>]*class="[^"]*dooplay_player_option[^"]*"[^>]*>/gi;
  const matches: Array<{ post: string; nume: string; type: string; label: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = dooRe.exec(html)) !== null) {
    const tag = m[0];
    const post = tag.match(/data-post=["']([^"']+)["']/i)?.[1];
    const nume = tag.match(/data-nume=["']([^"']+)["']/i)?.[1];
    const type = tag.match(/data-type=["']([^"']+)["']/i)?.[1] || 'tv';
    if (!post || !nume || nume === 'trailer') continue;
    const chunk = html.slice(m.index, m.index + 320);
    const label = chunk
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40);
    matches.push({ post, nume, type, label: label || `Server ${nume}` });
  }
  if (matches.length === 0) return embeds;

  let origin: string;
  try {
    origin = new URL(episodePageUrl).origin;
  } catch {
    return embeds;
  }

  for (const opt of matches.slice(0, 4)) {
    try {
      const form = new URLSearchParams({
        action: 'doo_player_ajax',
        post: opt.post,
        nume: opt.nume,
        type: opt.type,
      });
      const res = await fetch(`${origin}/wp-admin/admin-ajax.php`, {
        method: 'POST',
        headers: {
          'User-Agent': BROWSER_UA,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Referer: episodePageUrl,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: form.toString(),
        signal: AbortSignal.timeout(6500),
      });
      if (!res.ok) continue;
      const rawText = await res.text();
      let embedUrl: string | null = null;
      try {
        const json = JSON.parse(rawText) as { embed_url?: string };
        if (json?.embed_url) {
          const iframeSrc = json.embed_url.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1];
          embedUrl = iframeSrc || json.embed_url;
        }
      } catch {
        embedUrl = rawText.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1] || null;
      }
      if (embedUrl) {
        const normalized = normalizeHttpUrl(embedUrl, episodePageUrl);
        if (normalized) {
          embeds.push({ label: opt.label, url: normalized });
        }
      }
    } catch {
      // Try next DooPlay player option
    }
  }

  return embeds;
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

function parseGogoEpisodeEmbeds(html: string, baseUrl: string): GenericEmbedCandidate[] {
  const embeds: GenericEmbedCandidate[] = [];
  const seen = new Set<string>();

  const liRe = /<li[^>]*>\s*<a[^>]*data-video="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = liRe.exec(html)) !== null) {
    const normalized = normalizeHttpUrl(match[1], baseUrl);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    const labelRaw = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const label = labelRaw.split(' ')[0] || `Server ${embeds.length + 1}`;
    embeds.push({ label, url: normalized });
  }

  if (embeds.length === 0) {
    const fallbackRe = /data-video="([^"]+)"/gi;
    while ((match = fallbackRe.exec(html)) !== null) {
      const normalized = normalizeHttpUrl(match[1], baseUrl);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      embeds.push({ label: `Server ${embeds.length + 1}`, url: normalized });
    }
  }

  if (embeds.length === 0) {
    const iframeMatch = html.match(/<iframe[^>]+src="([^"]+newplayer\.php[^"]+)"/i);
    if (iframeMatch?.[1]) {
      const normalized = normalizeHttpUrl(iframeMatch[1], baseUrl);
      if (normalized) {
        embeds.push({ label: 'HD-1', url: normalized });
      }
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
    const iframeMatch = page.text.match(/<iframe[^>]+(?:data-src|src)=["']([^"']+)["']/i);
    if (!iframeMatch?.[1]) return null;
    return normalizeHttpUrl(iframeMatch[1], page.url);
  } catch {
    return null;
  }
}

interface UnwrappedStreamMedia {
  streamUrl: string;
  referer: string;
  subtitles: MappedSubtitleTrack[];
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
}

async function resolveMegaPlayOrCompatibleIframe(
  iframeUrl: string,
  preferredCategory: 'sub' | 'dub' | 'raw',
  embedReferer: string,
): Promise<UnwrappedStreamMedia | null> {
  if (!isSafeExternalHttpUrl(iframeUrl)) return null;

  // Adjust /sub vs /dub path cleanly if compatible stream player
  let candidateUrl = iframeUrl;
  if (preferredCategory === 'dub' && /\/sub(?:[?#]|$)/i.test(candidateUrl)) {
    candidateUrl = candidateUrl.replace(/\/sub([?#]|$)/i, '/dub$1');
  } else if (preferredCategory === 'sub' && /\/dub(?:[?#]|$)/i.test(candidateUrl)) {
    candidateUrl = candidateUrl.replace(/\/dub([?#]|$)/i, '/sub$1');
  }

  const attempt = async (targetUrl: string): Promise<UnwrappedStreamMedia | null> => {
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

  return attempt(candidateUrl);
}

/**
 * Resolves either a MegaPlay/VidWish encrypted iframe OR a generic HTML5/HLS/MP4 embed
 * (supporting Dean Edwards packer obfuscation and 1 nested iframe redirect).
 */
async function unwrapGenericOrCompatibleEmbed(
  embedUrl: string,
  episodePageUrl: string,
  effectiveCategory: 'sub' | 'dub' | 'raw',
  allowFallbackToSub: boolean,
): Promise<UnwrappedStreamMedia | null> {
  if (!isSafeExternalHttpUrl(embedUrl)) return null;

  // If URL is already a direct video/playlist URL
  if (/\.(?:m3u8|mp4)(?:\?|$)/i.test(embedUrl)) {
    return {
      streamUrl: embedUrl,
      referer: episodePageUrl,
      subtitles: [],
      intro: null,
      outro: null,
    };
  }

  const iframeUrl = await resolveEmbedIframeUrl(embedUrl, episodePageUrl);
  if (iframeUrl) {
    let mediaData = await resolveMegaPlayOrCompatibleIframe(
      iframeUrl,
      effectiveCategory,
      embedUrl,
    );
    if (!mediaData && allowFallbackToSub && effectiveCategory === 'dub') {
      mediaData = await resolveMegaPlayOrCompatibleIframe(iframeUrl, 'sub', embedUrl);
    }
    if (mediaData) return mediaData;
  }

  // Fallback: inspect embed HTML (and nested iframe HTML if any) for direct m3u8 / mp4 sources
  const visited = new Set<string>();
  const urlsToInspect = [embedUrl];
  if (iframeUrl && iframeUrl !== embedUrl) {
    urlsToInspect.push(iframeUrl);
  }

  for (const targetUrl of urlsToInspect) {
    if (visited.has(targetUrl) || !isSafeExternalHttpUrl(targetUrl)) continue;
    visited.add(targetUrl);
    try {
      const res = await fetchText(targetUrl, { Referer: episodePageUrl }, 8000);
      if (!res.ok) continue;

      const direct = extractDirectVideoUrlFromHtmlOrScript(res.text, res.url);
      if (direct && isSafeExternalHttpUrl(direct)) {
        const origin = new URL(res.url).origin + '/';
        return {
          streamUrl: direct,
          referer: origin,
          subtitles: [],
          intro: null,
          outro: null,
        };
      }

      // Check 1 nested iframe hop
      const nestedIframe = res.text.match(/<iframe[^>]+(?:data-src|src)=["']([^"']+)["']/i)?.[1];
      if (nestedIframe) {
        const nestedAbs = normalizeHttpUrl(nestedIframe, res.url);
        if (nestedAbs && !visited.has(nestedAbs)) {
          const nestedRes = await fetchText(nestedAbs, { Referer: res.url }, 8000);
          if (nestedRes.ok) {
            const nestedDirect = extractDirectVideoUrlFromHtmlOrScript(
              nestedRes.text,
              nestedRes.url,
            );
            if (nestedDirect && isSafeExternalHttpUrl(nestedDirect)) {
              const origin = new URL(nestedRes.url).origin + '/';
              return {
                streamUrl: nestedDirect,
                referer: origin,
                subtitles: [],
                intro: null,
                outro: null,
              };
            }
          }
        }
      }
    } catch {
      // Try next candidate
    }
  }

  return null;
}

async function searchGogoAcrossQueries(
  host: string,
  queries: string[],
  targetTitles: string[],
  category: 'sub' | 'dub' | 'raw',
  format?: string | null,
  audioLanguage?: StreamAudioLanguage,
): Promise<Array<GogoSearchCandidate & { score: number }>> {
  const allCandidates = new Map<string, GogoSearchCandidate>();
  const querySubset =
    audioLanguage === 'hi' || audioLanguage === 'es' ? queries.slice(0, 3) : queries;

  const rankViable = (items: Iterable<GogoSearchCandidate>) =>
    Array.from(items)
      .filter((c) => isViableTitleMatch(c, targetTitles, format))
      .map((c) => ({
        ...c,
        score: scoreGogoSearchCandidate(c, {
          titles: targetTitles,
          category,
          format,
          audioLanguage,
        }),
      }))
      .sort((a, b) => b.score - a.score);

  for (let qIdx = 0; qIdx < querySubset.length; qIdx++) {
    const query = querySubset[qIdx];
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
        const rankedNow = rankViable(allCandidates.values());
        if (audioLanguage === 'hi' || audioLanguage === 'es') {
          const hasExplicitLangCandidate = rankedNow.some((c) =>
            candidateMatchesAudioLanguage(c, audioLanguage),
          );
          if (hasExplicitLangCandidate && rankedNow[0] && rankedNow[0].score >= 120) {
            return rankedNow;
          }
          if (qIdx >= 1 && rankedNow.length > 0) {
            return rankedNow;
          }
        } else if (rankedNow[0] && rankedNow[0].score >= 85) {
          return rankedNow;
        }
      }
    } catch {
      // Try next query
    }
  }

  return rankViable(allCandidates.values());
}

async function searchGenericSiteAcrossQueries(
  host: string,
  queries: string[],
  targetTitles: string[],
  category: 'sub' | 'dub' | 'raw',
  format?: string | null,
  audioLanguage?: StreamAudioLanguage,
): Promise<Array<GogoSearchCandidate & { score: number }>> {
  const allCandidates = new Map<string, GogoSearchCandidate>();

  const rankViable = (items: Iterable<GogoSearchCandidate>) =>
    Array.from(items)
      .filter((c) => isViableTitleMatch(c, targetTitles, format))
      .map((c) => ({
        ...c,
        score: scoreGogoSearchCandidate(c, {
          titles: targetTitles,
          category,
          format,
          audioLanguage,
        }),
      }))
      .sort((a, b) => b.score - a.score);

  for (const query of queries.slice(0, 5)) {
    const searchEndpoints = [
      `${host}/?s=${encodeURIComponent(query)}`,
      `${host}/search.html?keyword=${encodeURIComponent(query)}`,
      `${host}/search?keyword=${encodeURIComponent(query)}`,
      `${host}/search?q=${encodeURIComponent(query)}`,
      `${host}/search/${encodeURIComponent(query)}/`,
    ];

    let foundOnAnyHtmlEndpoint = false;
    for (const endpoint of searchEndpoints) {
      try {
        const res = await fetchText(endpoint, { Referer: `${host}/` }, 6500);
        if (!res.ok) continue;

        const gogoItems = parseGogoSearchHtml(res.text);
        const genericItems = parseGenericSearchHtml(res.text, res.url || host);
        const merged = [...gogoItems, ...genericItems];
        for (const item of merged) {
          if (!allCandidates.has(item.href)) {
            allCandidates.set(item.href, item);
          }
        }
        if (merged.length > 0) {
          foundOnAnyHtmlEndpoint = true;
          break;
        }
      } catch {
        // Try next search endpoint pattern
      }
    }

    // Fallback: WordPress REST search API when HTML search is SPA/JS-rendered
    if (!foundOnAnyHtmlEndpoint) {
      try {
        const wpRes = await fetchText(
          `${host}/wp-json/wp/v2/search?search=${encodeURIComponent(query)}&per_page=10`,
          { Referer: `${host}/`, Accept: 'application/json' },
          5500,
        );
        if (wpRes.ok) {
          const wpJson = JSON.parse(wpRes.text) as Array<{ url?: string; title?: string }>;
          if (Array.isArray(wpJson)) {
            for (const row of wpJson) {
              if (!row?.url || !row?.title) continue;
              try {
                const u = new URL(row.url);
                const href = `${u.pathname}${u.search}`;
                if (!allCandidates.has(href)) {
                  allCandidates.set(href, { href, title: row.title });
                }
              } catch {
                // Skip invalid URL
              }
            }
          }
        }
      } catch {
        // WP REST API unavailable on this host
      }
    }

    if (allCandidates.size > 0 && audioLanguage !== 'hi' && audioLanguage !== 'es') {
      const rankedNow = rankViable(allCandidates.values());
      if (rankedNow[0] && rankedNow[0].score >= 100) {
        return rankedNow;
      }
    }
  }

  return rankViable(allCandidates.values());
}

async function resolveEpisodePageUrls(
  host: string,
  slug: string,
  episodeNumber: number,
  candidateHref?: string,
): Promise<string[]> {
  const candidates: string[] = [];
  const pushUrl = (u: string) => {
    if (!candidates.includes(u)) candidates.push(u);
  };

  const epNumStr = Number.isInteger(episodeNumber)
    ? String(episodeNumber)
    : String(episodeNumber).replace('.', '-');
  pushUrl(`${host}/${slug}-episode-${epNumStr}`);

  // Inspect either /category/{slug} or the candidate's actual series page URL
  const seriesUrls = candidateHref
    ? Array.from(
        new Set([
          normalizeHttpUrl(candidateHref, host) || `${host}/category/${slug}`,
          `${host}/category/${slug}`,
        ]),
      )
    : [`${host}/category/${slug}`];

  for (const seriesUrl of seriesUrls) {
    try {
      const catRes = await fetchText(seriesUrl, { Referer: `${host}/` }, 6500);
      if (!catRes.ok) continue;
      const html = catRes.text;

      // Generic episode anchor matching (handles WordPress / DooPlay / AnimeStream / custom extensions)
      const genericLinks = parseGenericEpisodeLinks(html, catRes.url || host, episodeNumber);
      for (const link of genericLinks.slice(0, 3)) {
        pushUrl(link);
      }

      // Gogo inline & AJAX episode list
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
          { Referer: seriesUrl },
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

      // If the series page itself embeds the player directly (e.g. movies or single-episode pages)
      if (parseGenericEmbedCandidates(html, catRes.url || seriesUrl).length > 0 && episodeNumber === 1) {
        pushUrl(catRes.url || seriesUrl);
      }
    } catch {
      // Keep direct URL candidate
    }
  }

  return candidates;
}

function candidateMatchesAudioLanguage(
  candidate: { href: string; title: string },
  audioLanguage: StreamAudioLanguage,
  sourceMeta?: { sourceLang?: string; sourceName?: string; sourceBaseUrl?: string },
): boolean {
  if (
    isSourceInherentLanguage(
      sourceMeta?.sourceLang,
      sourceMeta?.sourceName,
      sourceMeta?.sourceBaseUrl,
      audioLanguage,
    )
  ) {
    return true;
  }
  const text = `${candidate.href} ${candidate.title}`.toLowerCase();
  if (audioLanguage === 'hi') {
    return /\bhindi\b|\bhin\b|\bmulti[\s-]?audio\b|\bdual[\s-]?audio\b/i.test(text);
  }
  if (audioLanguage === 'es') {
    return /\bspanish\b|\bespanol\b|\bespañol\b|\blatino\b|\bcastellano\b|\bmulti[\s-]?audio\b/i.test(
      text,
    );
  }
  return true;
}

function embedsMatchAudioLanguage(
  embeds: GenericEmbedCandidate[],
  audioLanguage: StreamAudioLanguage,
): boolean {
  if (audioLanguage !== 'hi' && audioLanguage !== 'es') return true;
  return embeds.some(
    (e) =>
      e.langHint === audioLanguage ||
      e.langHint === 'multi' ||
      (audioLanguage === 'hi' && /\bhindi\b|\bhin\b/i.test(`${e.label} ${e.url}`)) ||
      (audioLanguage === 'es' &&
        /\bspanish\b|\bespanol\b|\blatino\b|\bcastellano\b/i.test(`${e.label} ${e.url}`)),
  );
}

function getAudioLanguageDisplayName(code: StreamAudioLanguage): string {
  switch (code) {
    case 'hi':
      return 'Hindi (Dub)';
    case 'es':
      return 'Spanish (Dub)';
    case 'en':
      return 'English (Dub)';
    case 'ja':
    default:
      return 'Japanese (Original)';
  }
}

function finalizePayload(input: {
  resolvedMirrors: Array<UnwrappedStreamMedia & { label: string }>;
  candidates: Array<{ href: string; title: string }>;
  targetTitles: string[];
  effectiveCategory: 'sub' | 'dub' | 'raw';
  requestedAudioLang: StreamAudioLanguage;
  hasDubProbe: boolean;
  candidateTitle: string;
  slug: string;
  episodeNumber: number;
  serverNameParam?: string;
  sourceLabel: string;
  sourceId?: string;
  sourceLang?: string;
  sourceBaseUrl?: string;
  fallbackQueryTitle: string;
  embedLangHints?: Array<string | undefined>;
}): ResolvedAnimeStreamPayload {
  const primary = input.resolvedMirrors[0];
  const isHls =
    /\.m3u8(?:$|\?)/i.test(primary.streamUrl) || !/\.mp4(?:$|\?)/i.test(primary.streamUrl);
  const proxiedUrl = buildStreamProxyUrl(
    primary.streamUrl,
    '/api/stream/proxy',
    primary.referer,
  );

  const availableAudios = detectAvailableAudiosFromSources({
    candidates: input.candidates,
    targetTitles: input.targetTitles,
    currentCategory: input.effectiveCategory,
    currentAudioLanguage: input.requestedAudioLang,
    hasDubProbe: input.hasDubProbe,
    embedLangHints: input.embedLangHints,
  });

  if (
    (input.requestedAudioLang === 'hi' ||
      isSourceInherentLanguage(
        input.sourceLang,
        input.sourceLabel,
        input.sourceBaseUrl,
        'hi',
      )) &&
    !availableAudios.some((a) => a.code === 'hi')
  ) {
    availableAudios.push({
      code: 'hi',
      shortLabel: 'HI',
      label: 'Hindi (Dub)',
      serverCategory: 'dub',
    });
  }

  if (
    (input.requestedAudioLang === 'es' ||
      isSourceInherentLanguage(
        input.sourceLang,
        input.sourceLabel,
        input.sourceBaseUrl,
        'es',
      )) &&
    !availableAudios.some((a) => a.code === 'es')
  ) {
    availableAudios.push({
      code: 'es',
      shortLabel: 'ES',
      label: 'Spanish (Dub)',
      serverCategory: 'dub',
    });
  }

  return {
    url: proxiedUrl,
    rawUrl: primary.streamUrl,
    quality: isHls ? '1080p HLS' : '720p MP4',
    isHls,
    serverName:
      input.serverNameParam ||
      `${input.sourceLabel} · ${primary.label} (${input.requestedAudioLang.toUpperCase()})`,
    provider: input.sourceLabel,
    sourceId: input.sourceId || 'shonenx-hls-inbuilt',
    matchedTitle: input.candidateTitle || input.fallbackQueryTitle,
    matchedSlug: input.slug,
    matchedEpisode: input.episodeNumber,
    referer: primary.referer,
    subtitles: primary.subtitles,
    availableAudios,
    intro: primary.intro,
    outro: primary.outro,
    mirrors: input.resolvedMirrors.map((m) => {
      const mIsHls =
        /\.m3u8(?:$|\?)/i.test(m.streamUrl) || !/\.mp4(?:$|\?)/i.test(m.streamUrl);
      return {
        url: buildStreamProxyUrl(m.streamUrl, '/api/stream/proxy', m.referer),
        quality: mIsHls ? '1080p HLS' : '720p MP4',
        isHls: mIsHls,
        serverName: `${m.label} (${input.requestedAudioLang.toUpperCase()})`,
      };
    }),
  };
}

/**
 * Resolves streams from HiAnime-compatible JSON AJAX providers (/ajax/v2/episode/*).
 */
async function resolveViaHiAnimeHost(input: {
  host: string;
  queries: string[];
  targetTitles: string[];
  format?: string | null;
  episodeNumber: number;
  effectiveCategory: 'sub' | 'dub' | 'raw';
  requestedAudioLang: StreamAudioLanguage;
  serverId?: string;
  serverName?: string;
  sourceLabel: string;
  sourceId?: string;
  sourceLang?: string;
  sourceBaseUrl?: string;
}): Promise<ResolvedAnimeStreamPayload | null> {
  if (input.requestedAudioLang === 'hi' || input.requestedAudioLang === 'es') {
    const inherent = isSourceInherentLanguage(
      input.sourceLang,
      input.sourceLabel,
      input.sourceBaseUrl,
      input.requestedAudioLang,
    );
    if (!inherent) {
      throw new Error(
        `${getAudioLanguageDisplayName(input.requestedAudioLang)} audio is not supported on ${input.sourceLabel}. Choose Japanese (Original) or English (Dub), or switch to a Hindi/Spanish extension.`,
      );
    }
  }

  const allCandidates = new Map<string, GogoSearchCandidate>();
  for (const query of input.queries.slice(0, 4)) {
    try {
      const res = await fetchText(
        `${input.host}/search?keyword=${encodeURIComponent(query)}`,
        { Referer: `${input.host}/` },
        7500,
      );
      if (!res.ok) continue;
      const parsed = parseGenericSearchHtml(res.text, input.host);
      for (const item of parsed) {
        if (!allCandidates.has(item.href)) {
          allCandidates.set(item.href, item);
        }
      }
      if (allCandidates.size > 0) break;
    } catch {
      // Try next query
    }
  }

  if (allCandidates.size === 0) return null;

  const ranked = Array.from(allCandidates.values())
    .filter((c) => isViableTitleMatch(c, input.targetTitles, input.format))
    .map((c) => ({
      ...c,
      score: scoreGogoSearchCandidate(c, {
        titles: input.targetTitles,
        category: input.effectiveCategory,
        format: input.format,
        audioLanguage: input.requestedAudioLang,
      }),
    }))
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) return null;

  for (const candidate of ranked.slice(0, 3)) {
    const idMatch = candidate.href.match(/-(\d+)(?:\?|$|\/)/);
    const animeNumericId = idMatch?.[1];
    if (!animeNumericId) continue;

    try {
      const epListRes = await fetchText(
        `${input.host}/ajax/v2/episode/list/${animeNumericId}`,
        {
          Referer: `${input.host}${candidate.href}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
        7500,
      );
      if (!epListRes.ok) continue;
      const epListJson = JSON.parse(epListRes.text) as { html?: string };
      const epListHtml = epListJson?.html || '';
      if (!epListHtml) continue;

      const epMatch =
        epListHtml.match(
          new RegExp(
            `data-number=["']${input.episodeNumber}["'][^>]*data-id=["'](\\d+)["']`,
            'i',
          ),
        ) ||
        epListHtml.match(
          new RegExp(
            `data-id=["'](\\d+)["'][^>]*data-number=["']${input.episodeNumber}["']`,
            'i',
          ),
        );
      const epDataId = epMatch?.[1];
      if (!epDataId) continue;

      const serversRes = await fetchText(
        `${input.host}/ajax/v2/episode/servers?episodeId=${encodeURIComponent(epDataId)}`,
        {
          Referer: `${input.host}${candidate.href}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
        7500,
      );
      if (!serversRes.ok) continue;
      const serversJson = JSON.parse(serversRes.text) as { html?: string };
      const serversHtml = serversJson?.html || '';
      if (!serversHtml) continue;

      const serverItems: Array<{
        type: string;
        dataId: string;
        label: string;
      }> = [];
      const srvRe =
        /<div[^>]*class="[^"]*server-item[^"]*"[^>]*data-type="([^"]+)"[^>]*data-id="(\d+)"[^>]*>([\s\S]*?)<\/div>/gi;
      let sm: RegExpExecArray | null;
      while ((sm = srvRe.exec(serversHtml)) !== null) {
        serverItems.push({
          type: sm[1].toLowerCase(),
          dataId: sm[2],
          label: sm[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || 'HD-1',
        });
      }

      const matchingServers = serverItems.filter(
        (s) => s.type === input.effectiveCategory || (input.effectiveCategory === 'sub' && s.type === 'raw'),
      );
      const hasDubProbe = serverItems.some((s) => s.type === 'dub');

      if (matchingServers.length === 0) {
        continue;
      }

      const preferHd2 =
        input.serverId === 'hd-2-sub' || /hd-2/i.test(input.serverName || '');
      const ordered =
        preferHd2 && matchingServers.length > 1
          ? [matchingServers[1], matchingServers[0], ...matchingServers.slice(2)]
          : matchingServers;

      const resolvedMirrors: Array<UnwrappedStreamMedia & { label: string }> = [];
      for (const srv of ordered.slice(0, 3)) {
        const srcRes = await fetchText(
          `${input.host}/ajax/v2/episode/sources?id=${encodeURIComponent(srv.dataId)}`,
          {
            Referer: `${input.host}${candidate.href}`,
            'X-Requested-With': 'XMLHttpRequest',
          },
          7500,
        );
        if (!srcRes.ok) continue;
        const srcJson = JSON.parse(srcRes.text) as { link?: string };
        if (!srcJson?.link) continue;

        const mediaData = await unwrapGenericOrCompatibleEmbed(
          srcJson.link,
          `${input.host}${candidate.href}`,
          input.effectiveCategory,
          false,
        );
        if (mediaData) {
          resolvedMirrors.push({ ...mediaData, label: srv.label });
          if (resolvedMirrors.length >= 2) break;
        }
      }

      if (resolvedMirrors.length > 0) {
        return finalizePayload({
          resolvedMirrors,
          candidates: ranked,
          targetTitles: input.targetTitles,
          effectiveCategory: input.effectiveCategory,
          requestedAudioLang: input.requestedAudioLang,
          hasDubProbe,
          candidateTitle: candidate.title,
          slug: extractSlugFromGogoHref(candidate.href),
          episodeNumber: input.episodeNumber,
          serverNameParam: input.serverName,
          sourceLabel: input.sourceLabel,
          sourceId: input.sourceId,
          sourceLang: input.sourceLang,
          sourceBaseUrl: input.sourceBaseUrl,
          fallbackQueryTitle: input.queries[0],
        });
      }
    } catch {
      // Try next candidate or host
    }
  }

  return null;
}

export async function resolveAnimeEpisodeStream(
  params: ResolveAnimeStreamParams,
): Promise<ResolvedAnimeStreamPayload> {
  const safeEpisodeNum =
    Number.isFinite(params.episodeNumber) && params.episodeNumber > 0
      ? params.episodeNumber
      : 1;

  const requestedAudioLang: StreamAudioLanguage =
    params.audioLanguage === 'ja' ||
    params.audioLanguage === 'en' ||
    params.audioLanguage === 'hi' ||
    params.audioLanguage === 'es'
      ? params.audioLanguage
      : params.category === 'dub' || params.serverId?.includes('dub')
        ? 'en'
        : 'ja';

  const effectiveCategory: 'sub' | 'dub' | 'raw' =
    requestedAudioLang === 'en' ||
    requestedAudioLang === 'hi' ||
    requestedAudioLang === 'es' ||
    params.category === 'dub' ||
    params.serverId?.includes('dub')
      ? 'dub'
      : 'sub';

  const hostPlan = resolveProviderHostPlan({
    sourceId: params.sourceId,
    sourceName: params.sourceName,
    sourceBaseUrl: params.sourceBaseUrl,
  });

  if (hostPlan.mode === 'missing-host' || hostPlan.hosts.length === 0) {
    throw new Error(
      `Extension "${hostPlan.sourceLabel}" does not have a valid stream base URL configured. Open Extensions settings to verify or reinstall this source.`,
    );
  }

  if (
    hostPlan.mode === 'custom-extension' &&
    isMetadataOnlyCatalogHost(params.sourceBaseUrl, hostPlan.sourceLabel)
  ) {
    throw new Error(
      `${hostPlan.sourceLabel} is an anime info catalog and does not host playable video streams. Switch to ShizuTv Stream (Inbuilt), HiAnime Bridge, or a streaming extension.`,
    );
  }

  const cacheKey = buildStreamResolverCacheKey({
    mediaId: params.mediaId,
    overrideTitle: params.titles.overrideTitle,
    english: params.titles.english,
    romaji: params.titles.romaji,
    episodeNumber: safeEpisodeNum,
    category: effectiveCategory,
    audioLanguage: requestedAudioLang,
    serverId: params.serverId,
    sourceId: params.sourceId,
    sourceBaseUrl: params.sourceBaseUrl,
    sourceLang: params.sourceLang,
  });

  if (!params.bypassCache) {
    const cached = resolvedStreamCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.payload;
    }
  }

  const queries = buildSearchQueriesForMedia(params.titles, requestedAudioLang);
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

  let lastError = `No working episode stream mirror responded on ${hostPlan.sourceLabel}.`;
  let sawCandidatesWithoutRequestedLanguage = false;

  for (const host of hostPlan.hosts) {
    if (hostPlan.mode === 'hianime') {
      try {
        const hiPayload = await resolveViaHiAnimeHost({
          host,
          queries,
          targetTitles,
          format: params.format,
          episodeNumber: safeEpisodeNum,
          effectiveCategory,
          requestedAudioLang,
          serverId: params.serverId,
          serverName: params.serverName,
          sourceLabel: hostPlan.sourceLabel,
          sourceId: params.sourceId,
          sourceLang: params.sourceLang,
          sourceBaseUrl: params.sourceBaseUrl,
        });
        if (hiPayload) {
          resolvedStreamCache.set(cacheKey, {
            expiresAt: Date.now() + CACHE_TTL_MS,
            payload: hiPayload,
          });
          return hiPayload;
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (requestedAudioLang === 'hi' || requestedAudioLang === 'es') {
          throw err;
        }
      }
      continue;
    }

    const candidates =
      hostPlan.mode === 'inbuilt'
        ? await searchGogoAcrossQueries(
            host,
            queries,
            targetTitles,
            effectiveCategory,
            params.format,
            requestedAudioLang,
          )
        : await searchGenericSiteAcrossQueries(
            host,
            queries,
            targetTitles,
            effectiveCategory,
            params.format,
            requestedAudioLang,
          );

    if (candidates.length === 0) {
      lastError = `No matching anime entries found on ${hostPlan.sourceLabel} for "${queries[0]}".`;
      continue;
    }

    const requiresStrictAudioMatch =
      requestedAudioLang === 'hi' || requestedAudioLang === 'es';
    const sourceInherentlyMatchesRequested = isSourceInherentLanguage(
      params.sourceLang,
      params.sourceName,
      params.sourceBaseUrl,
      requestedAudioLang,
    );

    const matchingAudioCandidates = requiresStrictAudioMatch
      ? candidates.filter((c) =>
          candidateMatchesAudioLanguage(c, requestedAudioLang, {
            sourceLang: params.sourceLang,
            sourceName: params.sourceName,
            sourceBaseUrl: params.sourceBaseUrl,
          }),
        )
      : candidates;

    const slugsToTry =
      requiresStrictAudioMatch && !sourceInherentlyMatchesRequested
        ? matchingAudioCandidates.length > 0
          ? matchingAudioCandidates.slice(0, 2)
          : candidates.slice(0, 1)
        : candidates.slice(0, 4);

    for (const candidate of slugsToTry) {
      const slug = extractSlugFromGogoHref(candidate.href);
      if (!slug) continue;

      // Support HiAnime-style hosts if a custom extension happens to be a HiAnime clone
      if (hostPlan.mode === 'custom-extension' && /-\d+(?:\?|$)/.test(candidate.href)) {
        const hiCustom = await resolveViaHiAnimeHost({
          host,
          queries,
          targetTitles,
          format: params.format,
          episodeNumber: safeEpisodeNum,
          effectiveCategory,
          requestedAudioLang,
          serverId: params.serverId,
          serverName: params.serverName,
          sourceLabel: hostPlan.sourceLabel,
          sourceId: params.sourceId,
          sourceLang: params.sourceLang,
          sourceBaseUrl: params.sourceBaseUrl,
        }).catch(() => null);
        if (hiCustom) {
          resolvedStreamCache.set(cacheKey, {
            expiresAt: Date.now() + CACHE_TTL_MS,
            payload: hiCustom,
          });
          return hiCustom;
        }
      }

      const episodeUrls = await resolveEpisodePageUrls(
        host,
        slug,
        safeEpisodeNum,
        candidate.href,
      );

      for (const epUrl of episodeUrls) {
        let epHtml = '';
        let resolvedEpUrl = epUrl;
        try {
          const epRes = await fetchText(epUrl, { Referer: `${host}/` }, 8000);
          if (!epRes.ok) continue;
          epHtml = epRes.text;
          resolvedEpUrl = epRes.url || epUrl;
        } catch {
          continue;
        }

        const gogoEmbeds = parseGogoEpisodeEmbeds(epHtml, resolvedEpUrl);
        const genericEmbeds = parseGenericEmbedCandidates(epHtml, resolvedEpUrl);
        const dooEmbeds =
          gogoEmbeds.length === 0 && genericEmbeds.length === 0 && hostPlan.mode === 'custom-extension'
            ? await parseDooPlayAjaxEmbeds(epHtml, resolvedEpUrl)
            : [];
        const combinedEmbeds: GenericEmbedCandidate[] = [];
        const seenEmbedUrls = new Set<string>();
        for (const emb of [...gogoEmbeds, ...genericEmbeds, ...dooEmbeds]) {
          if (!seenEmbedUrls.has(emb.url)) {
            seenEmbedUrls.add(emb.url);
            combinedEmbeds.push(emb);
          }
        }
        // Check if the episode HTML itself directly embeds an m3u8 / mp4 URL
        if (combinedEmbeds.length === 0) {
          const directInline = extractDirectVideoUrlFromHtmlOrScript(epHtml, resolvedEpUrl);
          if (directInline && isSafeExternalHttpUrl(directInline)) {
            const origin = new URL(resolvedEpUrl).origin + '/';
            const directPayload = finalizePayload({
              resolvedMirrors: [
                {
                  streamUrl: directInline,
                  referer: origin,
                  subtitles: [],
                  intro: null,
                  outro: null,
                  label: 'Direct',
                },
              ],
              candidates,
              targetTitles,
              effectiveCategory,
              requestedAudioLang,
              hasDubProbe: false,
              candidateTitle: candidate.title,
              slug,
              episodeNumber: safeEpisodeNum,
              serverNameParam: params.serverName,
              sourceLabel: hostPlan.sourceLabel,
              sourceId: params.sourceId,
              sourceLang: params.sourceLang,
              sourceBaseUrl: params.sourceBaseUrl,
              fallbackQueryTitle: queries[0],
            });
            resolvedStreamCache.set(cacheKey, {
              expiresAt: Date.now() + CACHE_TTL_MS,
              payload: directPayload,
            });
            return directPayload;
          }
          continue;
        }

        if (requiresStrictAudioMatch && !sourceInherentlyMatchesRequested) {
          const candOk = candidateMatchesAudioLanguage(candidate, requestedAudioLang, {
            sourceLang: params.sourceLang,
            sourceName: params.sourceName,
            sourceBaseUrl: params.sourceBaseUrl,
          });
          const embOk = embedsMatchAudioLanguage(combinedEmbeds, requestedAudioLang);
          if (!candOk && !embOk) {
            sawCandidatesWithoutRequestedLanguage = true;
            continue;
          }
        }

        const orderedEmbeds = sortEmbedsForAudioLanguage(combinedEmbeds, {
          audioLanguage: requestedAudioLang,
          serverId: params.serverId,
          serverName: params.serverName,
        });

        let hasDubProbe = false;
        const resolvedMirrors: Array<UnwrappedStreamMedia & { label: string }> = [];

        const initialAudiosWithoutProbe = detectAvailableAudiosFromSources({
          candidates,
          targetTitles,
          currentCategory: effectiveCategory,
          hasDubProbe: false,
        });
        const alreadyHasDubCandidate = initialAudiosWithoutProbe.some((a) => a.code === 'en');

        for (const emb of orderedEmbeds.slice(0, 3)) {
          const allowSubFallback =
            !requiresStrictAudioMatch &&
            (effectiveCategory !== 'dub' || /-dub$/i.test(slug));

          let mediaData = await unwrapGenericOrCompatibleEmbed(
            emb.url,
            resolvedEpUrl,
            effectiveCategory,
            allowSubFallback,
          );

          if (
            resolvedMirrors.length === 0 &&
            effectiveCategory === 'sub' &&
            !alreadyHasDubCandidate
          ) {
            const iframeUrl = await resolveEmbedIframeUrl(emb.url, resolvedEpUrl);
            if (iframeUrl && /\/(?:sub|dub)(?:[?#]|$)/i.test(iframeUrl)) {
              const dubProbe = await resolveMegaPlayOrCompatibleIframe(
                iframeUrl,
                'dub',
                emb.url,
              ).catch(() => null);
              if (dubProbe?.streamUrl) hasDubProbe = true;
            }
          }

          if (!mediaData && effectiveCategory === 'dub' && !/-dub$/i.test(slug) && !sourceInherentlyMatchesRequested) {
            continue;
          }

          if (mediaData) {
            resolvedMirrors.push({
              ...mediaData,
              label: emb.label,
            });
            if (resolvedMirrors.length >= 2) break;
          }
        }

        if (resolvedMirrors.length > 0) {
          const payload = finalizePayload({
            resolvedMirrors,
            candidates,
            targetTitles,
            effectiveCategory,
            requestedAudioLang,
            hasDubProbe,
            candidateTitle: candidate.title,
            slug,
            episodeNumber: safeEpisodeNum,
            serverNameParam: params.serverName,
            sourceLabel: hostPlan.sourceLabel,
            sourceId: params.sourceId,
            sourceLang: params.sourceLang,
            sourceBaseUrl: params.sourceBaseUrl,
            fallbackQueryTitle: queries[0],
            embedLangHints: combinedEmbeds.map((emb) => emb.langHint),
          });

          resolvedStreamCache.set(cacheKey, {
            expiresAt: Date.now() + CACHE_TTL_MS,
            payload,
          });
          return payload;
        }
      }
    }

    if (hostPlan.mode === 'inbuilt' && sawCandidatesWithoutRequestedLanguage) {
      break;
    }
  }

  // Secondary inbuilt mirror sweep across HiAnime-compatible hosts (strict title viability still enforced)
  if (hostPlan.mode === 'inbuilt' && !sawCandidatesWithoutRequestedLanguage) {
    for (const hiHost of HIANIME_BRIDGE_HOSTS) {
      try {
        const hiPayload = await resolveViaHiAnimeHost({
          host: hiHost,
          queries,
          targetTitles,
          format: params.format,
          episodeNumber: safeEpisodeNum,
          effectiveCategory,
          requestedAudioLang,
          serverId: params.serverId,
          serverName: params.serverName,
          sourceLabel: hostPlan.sourceLabel,
          sourceId: params.sourceId,
          sourceLang: params.sourceLang,
          sourceBaseUrl: params.sourceBaseUrl,
        });
        if (hiPayload) {
          resolvedStreamCache.set(cacheKey, {
            expiresAt: Date.now() + CACHE_TTL_MS,
            payload: hiPayload,
          });
          return hiPayload;
        }
      } catch {
        // Continue to next mirror
      }
    }
  }

  const displayTitle = targetTitles[0] || queries[0];
  if (
    sawCandidatesWithoutRequestedLanguage &&
    (requestedAudioLang === 'hi' || requestedAudioLang === 'es')
  ) {
    throw new Error(
      `${getAudioLanguageDisplayName(requestedAudioLang)} audio is not available for "${displayTitle}" on ${hostPlan.sourceLabel}. Switch to an extension that hosts ${requestedAudioLang === 'hi' ? 'Hindi' : 'Spanish'} streams or select English / Japanese audio.`,
    );
  }

  throw new Error(lastError);
}
