export interface MediaSearchTitlesInput {
  overrideTitle?: string | null;
  english?: string | null;
  romaji?: string | null;
  native?: string | null;
  synonyms?: string[] | null;
}

export interface GogoSearchCandidate {
  href: string;
  title: string;
}

export interface RawSubtitleTrack {
  file?: string;
  label?: string;
  kind?: string;
  default?: boolean;
}

export interface MappedSubtitleTrack {
  lang: string;
  label: string;
  url: string;
}

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'and',
  'or',
  'in',
  'on',
  'to',
  'no',
  'wa',
  'ga',
  'wo',
  'ni',
]);

const SPINOFF_PENALTY_KEYWORDS = [
  'mini anime',
  'marumaru',
  'chibi',
  'recap',
  'compilation',
  'special',
  'picture drama',
  'ova',
  'ona',
  'summary',
  'cm',
  'pv',
];

export function normalizeTitleForMatch(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/\(dub\)|\(sub\)|\[dub\]|\[sub\]/gi, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function extractSlugFromGogoHref(href: string): string {
  return String(href || '')
    .trim()
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/category\//i, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

export type StreamAudioLanguage = 'ja' | 'en' | 'hi' | 'es';

export function buildSearchQueriesForMedia(
  input: MediaSearchTitlesInput,
  audioLanguage?: StreamAudioLanguage | string | null,
): string[] {
  const rawCandidates: string[] = [];
  const pushUnique = (val?: string | null) => {
    const clean = typeof val === 'string' ? val.replace(/\s+/g, ' ').trim() : '';
    if (!clean || clean.length < 2) return;
    if (!rawCandidates.includes(clean)) rawCandidates.push(clean);
  };

  pushUnique(input.overrideTitle);
  pushUnique(input.english);
  pushUnique(input.romaji);
  if (Array.isArray(input.synonyms)) {
    for (const syn of input.synonyms.slice(0, 3)) {
      if (syn && /[a-z0-9]/i.test(syn)) pushUnique(syn);
    }
  }

  const expanded: string[] = [];
  const addExpanded = (q: string) => {
    const clean = q.replace(/\s+/g, ' ').trim();
    if (!clean || clean.length < 2) return;
    if (!expanded.includes(clean)) expanded.push(clean);
  };

  for (const title of rawCandidates) {
    addExpanded(title);

    // Strip parenthetical qualifiers & subtitles after colon/dash
    const noParens = title.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    if (noParens && noParens !== title) addExpanded(noParens);

    const beforeColon = noParens.split(/[:–—-]/)[0]?.trim();
    if (beforeColon && beforeColon.length >= 3 && beforeColon !== noParens) {
      addExpanded(beforeColon);
    }

    // Remove apostrophes/punctuation (helps search tokenizer on e.g. "Journey's")
    const asciiCleaned = noParens
      .replace(/['’`]/g, '')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (asciiCleaned) addExpanded(asciiCleaned);
  }

  // Short root fallbacks (first 1-2 significant words of English/override/Romaji)
  const primaryTitle = rawCandidates[0] || '';
  if (primaryTitle) {
    const words = primaryTitle
      .replace(/['’`:–—-]/g, ' ')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    if (words.length >= 2) {
      addExpanded(words.slice(0, 2).join(' '));
    }
    if (words.length >= 1 && words[0].length >= 4 && !STOP_WORDS.has(words[0].toLowerCase())) {
      addExpanded(words[0]);
    }
  }

  // Prioritize language-specific query when Hindi or Spanish audio is requested
  const cleanLang = typeof audioLanguage === 'string' ? audioLanguage.trim().toLowerCase() : '';
  if (primaryTitle && (cleanLang === 'hi' || cleanLang === 'es')) {
    const rootClean = primaryTitle
      .replace(/\([^)]*\)/g, ' ')
      .replace(/['’`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (rootClean) {
      const langQuery =
        cleanLang === 'hi' ? `${rootClean} Hindi` : `${rootClean} Spanish`;
      return [
        langQuery,
        ...expanded.filter((q) => q.toLowerCase() !== langQuery.toLowerCase()),
      ].slice(0, 9);
    }
  }

  return expanded.slice(0, 9);
}

function tokenizeNormalized(norm: string): string[] {
  return norm.split(/\s+/).filter(Boolean);
}

function hasSeasonMarker(text: string): string | null {
  const m =
    text.match(/\bseason\s*(\d+)\b/i) ||
    text.match(/\b(\d+)(?:st|nd|rd|th)\s*season\b/i) ||
    text.match(/\bs(\d+)\b/i);
  if (m) return m[1];
  return null;
}

export function scoreGogoSearchCandidate(
  candidate: GogoSearchCandidate,
  target: {
    titles: string[];
    category: 'sub' | 'dub' | 'raw';
    format?: string | null;
    audioLanguage?: StreamAudioLanguage | string | null;
  },
): number {
  const slug = extractSlugFromGogoHref(candidate.href).toLowerCase();
  const rawTitleLower = String(candidate.title || '').toLowerCase();
  const combinedLangText = `${slug} ${rawTitleLower}`;
  const candNorm = normalizeTitleForMatch(
    candidate.title
      .replace(/\b(hindi|spanish|espanol|latino|castellano|multi[\s-]?audio|eng[\s-]?dub)\b/gi, ' ') ||
      slug.replace(/-/g, ' '),
  );
  const slugNorm = normalizeTitleForMatch(
    slug
      .replace(/-/g, ' ')
      .replace(/\b(hindi|spanish|espanol|latino|castellano|multi[\s-]?audio|dub)\b/gi, ' '),
  );
  const candIsHindi = /\bhindi\b|\bhindi[\s-]?dub\b/i.test(combinedLangText);
  const candIsSpanish = /\bspanish\b|\bespanol\b|\bcastellano\b|\blatino\b/i.test(combinedLangText);
  const candIsMultiAudio = /\bmulti[\s-]?audio\b|\bdual[\s-]?audio\b/i.test(combinedLangText);
  const candIsDub =
    /-dub(?:$|-)/i.test(slug) || /\(dub\)|\[dub\]|\bdubbed\b/i.test(rawTitleLower);

  let bestScore = -1000;

  for (let tIdx = 0; tIdx < target.titles.length; tIdx++) {
    const rawTarget = target.titles[tIdx];
    const targetNorm = normalizeTitleForMatch(rawTarget);
    if (!targetNorm) continue;

    let score = 0;
    // Slight preference for earlier title in prioritized list (e.g. overrideTitle > English > Romaji)
    score -= tIdx * 3;

    if (candNorm === targetNorm || slugNorm === targetNorm) {
      score += 120;
    } else if (candNorm.startsWith(targetNorm) || targetNorm.startsWith(candNorm)) {
      score += 75;
    }

    const candTokens = tokenizeNormalized(candNorm);
    const targetTokens = tokenizeNormalized(targetNorm);
    const candSet = new Set(candTokens);
    const targetSet = new Set(targetTokens);

    let overlap = 0;
    for (const tok of targetSet) {
      if (candSet.has(tok)) overlap += 1;
    }
    const recall = targetSet.size > 0 ? overlap / targetSet.size : 0;
    const precision = candSet.size > 0 ? overlap / candSet.size : 0;
    score += Math.round(recall * 60 + precision * 35);

    // Extra word length difference penalty (e.g. "Naruto" vs "Boruto: Naruto the Movie")
    const extraTokens = Math.max(0, candTokens.length - overlap);
    score -= extraTokens * 8;

    // Season number alignment
    const targetSeason = hasSeasonMarker(targetNorm);
    const candSeason = hasSeasonMarker(candNorm);
    if (targetSeason && candSeason) {
      score += targetSeason === candSeason ? 35 : -50;
    } else if (!targetSeason && candSeason && Number(candSeason) > 1) {
      score -= 38;
    } else if (targetSeason && !candSeason) {
      score -= 25;
    }

    // Movie format hint
    const candIsMovie = /\bmovie\b|\bfilm\b/.test(candNorm);
    if (target.format === 'MOVIE' && candIsMovie) {
      score += 20;
    } else if (target.format !== 'MOVIE' && candIsMovie && !/\bmovie\b|\bfilm\b/.test(targetNorm)) {
      score -= 30;
    }

    // Penalize unrelated spin-offs / recaps / mini anime unless explicitly asked
    for (const kw of SPINOFF_PENALTY_KEYWORDS) {
      if (candNorm.includes(kw) && !targetNorm.includes(kw)) {
        score -= 45;
      }
    }

    if (score > bestScore) {
      bestScore = score;
    }
  }

  // Audio language & category alignment (JP Sub vs EN Dub vs HI Dub vs ES Dub)
  const reqAudio =
    typeof target.audioLanguage === 'string' ? target.audioLanguage.toLowerCase() : '';
  if (reqAudio === 'hi') {
    if (candIsHindi) bestScore += 95;
    else if (candIsMultiAudio) bestScore += 70;
    else if (candIsSpanish) bestScore -= 60;
    else if (candIsDub) bestScore -= 10;
  } else if (reqAudio === 'es') {
    if (candIsSpanish) bestScore += 95;
    else if (candIsMultiAudio) bestScore += 65;
    else if (candIsHindi) bestScore -= 60;
    else if (candIsDub) bestScore -= 10;
  } else if (target.category === 'dub' || reqAudio === 'en') {
    if (candIsHindi || candIsSpanish) {
      bestScore -= 65;
    } else if (candIsDub || candIsMultiAudio) {
      bestScore += 55;
    } else {
      bestScore -= 15;
    }
  } else {
    if (candIsHindi || candIsSpanish) {
      bestScore -= 70;
    } else {
      bestScore += candIsDub ? -65 : 20;
    }
  }

  return bestScore;
}

export function buildStreamProxyUrl(
  targetUrl: string,
  proxyPrefix = '/api/stream/proxy',
  referer?: string,
): string {
  const params = new URLSearchParams();
  params.set('url', targetUrl);
  if (referer && referer.trim()) {
    params.set('referer', referer.trim());
  }
  return `${proxyPrefix}?${params.toString()}`;
}

export function rewriteM3u8Manifest(
  manifestText: string,
  baseManifestUrl: string,
  proxyPrefix = '/api/stream/proxy',
  referer?: string,
): string {
  const lines = String(manifestText || '').split(/\r?\n/);
  const rewritten = lines.map((rawLine) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return rawLine;

    if (trimmed.startsWith('#')) {
      // Rewrite URI="..." attributes inside #EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA, #EXT-X-I-FRAME-STREAM-INF, etc.
      return rawLine.replace(/URI="([^"]+)"/g, (_match, rawUri: string) => {
        try {
          const abs = new URL(rawUri, baseManifestUrl).toString();
          return `URI="${buildStreamProxyUrl(abs, proxyPrefix, referer)}"`;
        } catch {
          return `URI="${rawUri}"`;
        }
      });
    }

    try {
      const absUrl = new URL(trimmed, baseManifestUrl).toString();
      return buildStreamProxyUrl(absUrl, proxyPrefix, referer);
    } catch {
      return rawLine;
    }
  });

  return rewritten.join('\n');
}

export function extractMegaPlayStreamUrl(decrypted: unknown): string | null {
  if (!decrypted) return null;
  if (typeof decrypted === 'string') {
    const s = decrypted.trim();
    return /^https?:\/\//i.test(s) ? s : null;
  }
  if (Array.isArray(decrypted)) {
    for (const item of decrypted) {
      const found = extractMegaPlayStreamUrl(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof decrypted === 'object') {
    const rec = decrypted as Record<string, unknown>;
    if (typeof rec.file === 'string' && /^https?:\/\//i.test(rec.file.trim())) {
      return rec.file.trim();
    }
    if (typeof rec.url === 'string' && /^https?:\/\//i.test(rec.url.trim())) {
      return rec.url.trim();
    }
    if (Array.isArray(rec.sources)) {
      return extractMegaPlayStreamUrl(rec.sources);
    }
  }
  return null;
}

export function mapSubtitleTracksFromSources(
  tracks: RawSubtitleTrack[] | undefined | null,
  proxyPrefix = '/api/stream/proxy',
  referer?: string,
): MappedSubtitleTrack[] {
  if (!Array.isArray(tracks) || tracks.length === 0) return [];
  const mapped: MappedSubtitleTrack[] = [];
  const seenTracks = new Set<string>();
  const usedLangCodes = new Set<string>();

  for (const track of tracks) {
    if (!track || typeof track.file !== 'string') continue;
    const rawFile = track.file.trim();
    if (!/^https?:\/\//i.test(rawFile)) continue;
    const kind = String(track.kind || '').toLowerCase();
    if (kind === 'thumbnails' || kind === 'metadata' || /thumbnails\.vtt/i.test(rawFile)) {
      continue;
    }

    const label = String(track.label || 'Subtitles').trim();
    const lower = label.toLowerCase();
    let baseLang = 'other';
    if (lower.includes('english')) baseLang = 'en';
    else if (lower.includes('japanese')) baseLang = 'ja';
    else if (lower.includes('spanish') || lower.includes('español') || lower.includes('espanol')) {
      baseLang =
        lower.includes('latin') || lower.includes('latam') || lower.includes('419')
          ? 'es-la'
          : 'es';
    } else if (lower.includes('french')) baseLang = 'fr';
    else if (lower.includes('german')) baseLang = 'de';
    else if (lower.includes('italian')) baseLang = 'it';
    else if (lower.includes('portuguese')) {
      baseLang = lower.includes('brazil') || lower.includes('br') ? 'pt-br' : 'pt';
    } else if (lower.includes('arabic')) baseLang = 'ar';
    else if (lower.includes('russian')) baseLang = 'ru';
    else baseLang = lower.replace(/[^a-z]/g, '').slice(0, 6) || 'sub';

    const uniqueTrackKey = `${baseLang}:${label}:${rawFile}`;
    if (seenTracks.has(uniqueTrackKey)) continue;
    seenTracks.add(uniqueTrackKey);

    let lang = baseLang;
    let suffix = 2;
    while (usedLangCodes.has(lang)) {
      lang = `${baseLang}-${suffix}`;
      suffix += 1;
    }
    usedLangCodes.add(lang);

    mapped.push({
      lang,
      label,
      url: buildStreamProxyUrl(rawFile, proxyPrefix, referer),
    });
  }

  // Prioritize English first, then Japanese, then others
  mapped.sort((a, b) => {
    const weight = (l: string) => (l === 'en' ? 0 : l === 'ja' ? 1 : 2);
    return weight(a.lang) - weight(b.lang);
  });

  return mapped;
}

export interface ResolvedAvailableAudioOption {
  code: 'ja' | 'en' | 'hi' | 'es';
  shortLabel: string;
  label: string;
  serverCategory: 'sub' | 'dub';
}

export function detectAvailableAudiosFromSources(input: {
  candidates: Array<{ href: string; title: string }>;
  targetTitles: string[];
  currentCategory: 'sub' | 'dub' | 'raw';
  hasDubProbe?: boolean;
}): ResolvedAvailableAudioOption[] {
  const audios: ResolvedAvailableAudioOption[] = [];
  const pushAudio = (opt: ResolvedAvailableAudioOption) => {
    if (!audios.some((a) => a.code === opt.code)) {
      audios.push(opt);
    }
  };

  const normalizedTargets = input.targetTitles
    .map((t) => normalizeTitleForMatch(t))
    .filter(Boolean);

  const isTitleCloseMatch = (candidateTitle: string, candidateSlug: string): boolean => {
    const candNorm = normalizeTitleForMatch(candidateTitle || candidateSlug.replace(/-/g, ' '));
    if (!candNorm) return false;
    const candTokens = candNorm.split(/\s+/).filter(Boolean);
    const candSet = new Set(candTokens);

    return normalizedTargets.some((targetNorm) => {
      if (candNorm === targetNorm || candNorm.startsWith(targetNorm) || targetNorm.startsWith(candNorm)) {
        return true;
      }
      const targetTokens = targetNorm.split(/\s+/).filter(Boolean);
      if (targetTokens.length === 0) return false;
      const hits = targetTokens.filter((tok) => candSet.has(tok)).length;
      return hits / targetTokens.length >= 0.75;
    });
  };

  let hasSubCandidate = input.currentCategory === 'sub';
  let hasDubCandidate = Boolean(input.hasDubProbe) || input.currentCategory === 'dub';
  let hasHindiCandidate = false;
  let hasSpanishCandidate = false;

  for (const cand of input.candidates) {
    const slug = extractSlugFromGogoHref(cand.href).toLowerCase();
    const rawTitle = String(cand.title || '').toLowerCase();
    const isDub = /-dub(?:$|-)/i.test(slug) || /\(dub\)|\[dub\]/i.test(rawTitle);
    const isHindi = /\bhindi\b/i.test(slug) || /\bhindi\b/i.test(rawTitle);
    const isSpanish = /\bspanish\b|\bespanol\b|\bcastellano\b|\blatino\b/i.test(`${slug} ${rawTitle}`);

    if (!isTitleCloseMatch(cand.title, slug)) continue;

    if (isHindi) {
      hasHindiCandidate = true;
    } else if (isSpanish) {
      hasSpanishCandidate = true;
    } else if (isDub) {
      hasDubCandidate = true;
    } else {
      hasSubCandidate = true;
    }
  }

  if (hasSubCandidate || !hasDubCandidate) {
    pushAudio({
      code: 'ja',
      shortLabel: 'JP',
      label: 'Japanese (Original)',
      serverCategory: 'sub',
    });
  }

  if (hasDubCandidate) {
    pushAudio({
      code: 'en',
      shortLabel: 'EN',
      label: 'English (Dub)',
      serverCategory: 'dub',
    });
  }

  if (hasHindiCandidate) {
    pushAudio({
      code: 'hi',
      shortLabel: 'HI',
      label: 'Hindi (Dub)',
      serverCategory: 'dub',
    });
  }

  if (hasSpanishCandidate) {
    pushAudio({
      code: 'es',
      shortLabel: 'ES',
      label: 'Spanish (Dub)',
      serverCategory: 'dub',
    });
  }

  return audios;
}

export const INBUILT_PRIMARY_HOSTS = [
  'https://ww5.gogoanimes.fi',
  'https://ww12.gogoanimes.fi',
] as const;

export const HIANIME_BRIDGE_HOSTS = [
  'https://hianime.to',
  'https://hianimez.to',
  'https://aniwatchtv.to',
] as const;

export type ProviderHostPlanMode =
  | 'inbuilt'
  | 'hianime'
  | 'custom-extension'
  | 'missing-host';

export interface ProviderHostPlan {
  mode: ProviderHostPlanMode;
  hosts: string[];
  sourceLabel: string;
}

function isValidExternalOrigin(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '::1' ||
      host === '[::1]' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^(?:10\.|127\.|169\.254\.|172\.(?:1[6-9]|2\d|3[0-1])\.|192\.168\.|0\.)/.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Strictly isolates stream resolution hosts to the selected source/extension.
 * - Default 'shonenx-hls-inbuilt' uses ShizuTv's primary hosts.
 * - 'hianime-bridge' uses HiAnime hosts (or explicit sourceBaseUrl if supplied).
 * - Any other selected extension ONLY uses its own sourceBaseUrl (never falls back to GogoAnime).
 */
export function resolveProviderHostPlan(params: {
  sourceId?: string | null;
  sourceName?: string | null;
  sourceBaseUrl?: string | null;
}): ProviderHostPlan {
  const cleanSourceId = typeof params.sourceId === 'string' ? params.sourceId.trim() : '';
  const cleanBaseUrl =
    typeof params.sourceBaseUrl === 'string'
      ? params.sourceBaseUrl.trim().replace(/\/+$/, '')
      : '';
  const sourceLabel =
    (typeof params.sourceName === 'string' && params.sourceName.trim()) ||
    cleanSourceId ||
    'ShizuTv Stream (Inbuilt)';

  if (!cleanSourceId || cleanSourceId === 'shonenx-hls-inbuilt') {
    const hosts =
      cleanBaseUrl && isValidExternalOrigin(cleanBaseUrl)
        ? [cleanBaseUrl, ...INBUILT_PRIMARY_HOSTS.filter((h) => h !== cleanBaseUrl)]
        : [...INBUILT_PRIMARY_HOSTS];
    return { mode: 'inbuilt', hosts, sourceLabel };
  }

  if (cleanSourceId === 'hianime-bridge') {
    const hosts =
      cleanBaseUrl && isValidExternalOrigin(cleanBaseUrl)
        ? [cleanBaseUrl, ...HIANIME_BRIDGE_HOSTS.filter((h) => h !== cleanBaseUrl)]
        : [...HIANIME_BRIDGE_HOSTS];
    return { mode: 'hianime', hosts, sourceLabel };
  }

  if (cleanBaseUrl && isValidExternalOrigin(cleanBaseUrl)) {
    return {
      mode: 'custom-extension',
      hosts: [cleanBaseUrl],
      sourceLabel,
    };
  }

  return {
    mode: 'missing-host',
    hosts: [],
    sourceLabel,
  };
}

export function buildStreamResolverCacheKey(params: {
  mediaId: string;
  overrideTitle?: string | null;
  english?: string | null;
  romaji?: string | null;
  episodeNumber: number;
  category: 'sub' | 'dub' | 'raw';
  audioLanguage?: string | null;
  serverId?: string | null;
  sourceId?: string | null;
  sourceBaseUrl?: string | null;
  sourceLang?: string | null;
}): string {
  return JSON.stringify({
    mediaId: params.mediaId,
    override: params.overrideTitle || '',
    en: params.english || '',
    ro: params.romaji || '',
    ep: params.episodeNumber,
    category: params.category,
    audioLanguage: (params.audioLanguage || '').toLowerCase(),
    serverId: params.serverId || '',
    sourceId: params.sourceId || 'shonenx-hls-inbuilt',
    sourceBaseUrl: (params.sourceBaseUrl || '').replace(/\/+$/, ''),
    sourceLang: (params.sourceLang || '').toLowerCase(),
  });
}

export function isSourceInherentLanguage(
  sourceLang?: string | null,
  sourceName?: string | null,
  sourceBaseUrl?: string | null,
  targetAudioLang?: string | null,
): boolean {
  const req = (targetAudioLang || '').trim().toLowerCase();
  if (!req) return false;
  const cleanLang = (sourceLang || '').trim().toLowerCase();
  const combined = `${sourceName || ''} ${sourceBaseUrl || ''}`.toLowerCase();
  if (req === 'hi') {
    return cleanLang === 'hi' || cleanLang === 'hindi' || /\bhindi\b|\bhin\b/.test(combined);
  }
  if (req === 'es') {
    return (
      cleanLang === 'es' ||
      cleanLang === 'spanish' ||
      /\bspanish\b|\bespanol\b|\blatino\b|\bcastellano\b/.test(combined)
    );
  }
  return cleanLang === req;
}

export interface GenericEmbedCandidate {
  label: string;
  url: string;
  langHint?: string;
}

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&#039;|&#39;|&apos;/g, "'")
    .replace(/&rsquo;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function inferLangHintFromText(text: string): string | undefined {
  const low = text.toLowerCase();
  if (/\bhindi\b|\bhin\b|\[hi\]|\(hi\)/.test(low)) return 'hi';
  if (/\bspanish\b|\bespanol\b|\bespañol\b|\blatino\b|\bcastellano\b/.test(low)) return 'es';
  if (/\benglish\b|\beng\b|\bdub\b/.test(low)) return 'en';
  if (/\bjapanese\b|\bjap\b|\bsub\b|\boriginal\b/.test(low)) return 'ja';
  if (/\bmulti[\s-]?audio\b|\bdual[\s-]?audio\b/.test(low)) return 'multi';
  return undefined;
}

/**
 * Extracts anime/series search result links from WordPress / DooPlay / AnimeStream /
 * HiAnime / generic extension search HTML pages.
 */
export function parseGenericSearchHtml(html: string, baseUrl: string): GogoSearchCandidate[] {
  const results: GogoSearchCandidate[] = [];
  const seen = new Set<string>();

  const pushResult = (rawHref: string, rawTitle: string) => {
    const cleanHref = decodeHtmlEntities(rawHref);
    if (!cleanHref || cleanHref.startsWith('#') || cleanHref.startsWith('javascript:')) return;
    if (/\.(?:jpg|jpeg|png|webp|gif|svg|css|js|ico)(?:\?|$)/i.test(cleanHref)) return;
    if (/\/(?:wp-content|wp-includes|tag|genre|genres|category\/action|author|page\/)\b/i.test(cleanHref)) {
      return;
    }

    let absUrl: string;
    try {
      const resolved = new URL(cleanHref, baseUrl);
      const baseHost = new URL(baseUrl).hostname.replace(/^www\./, '');
      const candHost = resolved.hostname.replace(/^www\./, '');
      if (candHost !== baseHost) return;
      if (resolved.pathname === '/' || resolved.pathname.length < 2) return;
      absUrl = `${resolved.pathname}${resolved.search}`;
    } catch {
      return;
    }

    const cleanTitle = decodeHtmlEntities(rawTitle.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    if (!cleanTitle || cleanTitle.length < 2) return;
    if (seen.has(absUrl)) return;
    seen.add(absUrl);
    results.push({ href: absUrl, title: cleanTitle });
  };

  // Pattern 1: Article / card blocks with anchor + title/heading/img-alt
  const articleRe = /<(?:article|div|li)[^>]*class="[^"]*(?:result-item|bsx|flw-item|post|anime|item|card|movie)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi;
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = articleRe.exec(html)) !== null) {
    const block = blockMatch[1];
    const anchorMatch = block.match(/<a[^>]+href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/i);
    if (!anchorMatch) continue;
    const href = anchorMatch[1];
    const attrs = anchorMatch[2] || '';
    const titleAttr = attrs.match(/\btitle=["']([^"']+)["']/i)?.[1];
    const headingMatch = block.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i)?.[1];
    const altMatch = block.match(/\balt=["']([^"']+)["']/i)?.[1];
    const title = titleAttr || headingMatch || anchorMatch[3] || altMatch || '';
    pushResult(href, title);
  }

  // Pattern 2: Direct anchors with title attribute or heading inside
  const anchorRe = /<a\s+[^>]*href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let aMatch: RegExpExecArray | null;
  while ((aMatch = anchorRe.exec(html)) !== null) {
    const href = aMatch[1];
    if (!/\/(?:series|anime|watch|category|shows|title|movie)\//i.test(href) && !/-[a-z0-9]+-\d+$/i.test(href)) {
      continue;
    }
    const attrs = aMatch[2] || '';
    const titleAttr = attrs.match(/\btitle=["']([^"']+)["']/i)?.[1];
    const innerText = aMatch[3] || '';
    const title = titleAttr || innerText;
    pushResult(href, title);
  }

  return results;
}

/**
 * Finds the best matching episode URL(s) inside a series page HTML for the target episodeNumber.
 */
export function parseGenericEpisodeLinks(
  html: string,
  baseUrl: string,
  episodeNumber: number,
): string[] {
  const candidates: Array<{ url: string; score: number }> = [];
  const seen = new Set<string>();
  const ep = Math.floor(episodeNumber);
  const epStr = Number.isInteger(episodeNumber)
    ? String(episodeNumber)
    : String(episodeNumber).replace('.', '-');

  const exactPatterns = [
    new RegExp(`(?:^|[-_/x])(?:ep(?:isode)?[-_]?|s\\d+e|1x|e)0*${ep}(?:$|[^0-9])`, 'i'),
    new RegExp(`[-/]0*${ep}/?$`, 'i'),
  ];

  const anchorRe = /<a\s+[^>]*href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const rawHref = decodeHtmlEntities(m[1]);
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) continue;
    let absUrl: string;
    try {
      const parsed = new URL(rawHref, baseUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      absUrl = parsed.toString();
    } catch {
      continue;
    }
    if (seen.has(absUrl)) continue;

    const innerText = decodeHtmlEntities((m[3] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    const attrs = m[2] || '';
    const dataNum = attrs.match(/data-(?:number|ep|episode)=["']([^"']+)["']/i)?.[1];

    let score = 0;
    if (dataNum && Number(dataNum) === episodeNumber) score += 100;
    const pathLower = new URL(absUrl).pathname.toLowerCase();
    if (exactPatterns.some((re) => re.test(pathLower))) score += 80;
    if (new RegExp(`(?:ep(?:isode)?\\s*0*${ep}\\b|\\b0*${ep}\\b)`, 'i').test(innerText)) score += 35;
    if (/episode|watch|ep-|\dx\d+|s\d+e\d+/i.test(pathLower)) score += 20;
    if (new RegExp(`-episode-${epStr}(?:$|\\?|/)`, 'i').test(pathLower)) score += 60;

    if (score >= 45) {
      seen.add(absUrl);
      candidates.push({ url: absUrl, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.map((c) => c.url);
}

/**
 * Extracts embed/iframe/server links from an extension's episode page HTML, keeping
 * any audio/language hints (Hindi, English, Japanese, Spanish, Multi-Audio) attached.
 */
export function parseGenericEmbedCandidates(
  html: string,
  baseUrl: string,
): GenericEmbedCandidate[] {
  const embeds: GenericEmbedCandidate[] = [];
  const seen = new Set<string>();

  const pushEmbed = (rawUrl: string, label: string, extraHintText = '') => {
    const decoded = decodeHtmlEntities(rawUrl);
    if (!decoded || decoded.startsWith('data:') || decoded.startsWith('about:')) return;
    let abs: string;
    try {
      const resolved = new URL(decoded, baseUrl);
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return;
      abs = resolved.toString();
    } catch {
      return;
    }
    if (/googlesyndication|doubleclick|facebook\.com|twitter\.com|disqus\.com|recaptcha/i.test(abs)) {
      return;
    }
    if (seen.has(abs)) return;
    seen.add(abs);
    const hint = inferLangHintFromText(`${label} ${extraHintText} ${abs}`);
    embeds.push({
      label: label.trim() || `Server ${embeds.length + 1}`,
      url: abs,
      langHint: hint,
    });
  };

  // 1. Buttons/tabs with data-video, data-src, data-embed, data-url
  const btnRe =
    /<(?:a|button|li|div|span)[^>]*data-(?:video|src|embed|player|url)=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/(?:a|button|li|div|span)>/gi;
  let m: RegExpExecArray | null;
  while ((m = btnRe.exec(html)) !== null) {
    const url = m[1];
    const attrs = m[2] || '';
    const inner = decodeHtmlEntities((m[3] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    const langAttr = attrs.match(/data-(?:lang|audio|type|name)=["']([^"']+)["']/i)?.[1] || '';
    pushEmbed(url, inner || langAttr || `Server ${embeds.length + 1}`, langAttr);
  }

  // 2. Iframes (src / data-src / data-litespeed-src)
  const iframeRe = /<iframe\b([^>]*)>/gi;
  while ((m = iframeRe.exec(html)) !== null) {
    const attrs = m[1] || '';
    const src =
      attrs.match(/\bdata-src=["']([^"']+)["']/i)?.[1] ||
      attrs.match(/\bdata-litespeed-src=["']([^"']+)["']/i)?.[1] ||
      attrs.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (!src) continue;
    const titleAttr = attrs.match(/\btitle=["']([^"']+)["']/i)?.[1] || '';
    const langAttr = attrs.match(/data-(?:lang|audio)=["']([^"']+)["']/i)?.[1] || '';
    pushEmbed(src, titleAttr || langAttr || `Embed ${embeds.length + 1}`, langAttr);
  }

  return embeds;
}

export function sortEmbedsForAudioLanguage<T extends { label: string; url: string; langHint?: string }>(
  embeds: T[],
  options: {
    audioLanguage?: string | null;
    serverId?: string | null;
    serverName?: string | null;
  },
): T[] {
  const reqAudio = (options.audioLanguage || '').toLowerCase();
  const preferHd2 =
    options.serverId === 'hd-2-sub' ||
    options.serverId === 'direct-mp4' ||
    /hd-2/i.test(options.serverName || '');

  const indexed = embeds.map((emb, idx) => {
    let score = 0;
    const combined = `${emb.label} ${emb.langHint || ''} ${emb.url}`.toLowerCase();
    const isHindi = emb.langHint === 'hi' || /\bhindi\b|\bhin\b/.test(combined);
    const isSpanish =
      emb.langHint === 'es' || /\bspanish\b|\bespanol\b|\blatino\b|\bcastellano\b/.test(combined);
    const isEnglish = emb.langHint === 'en' || /\benglish\b|\beng\b|\bdub\b/.test(combined);
    const isJapanese = emb.langHint === 'ja' || /\bjapanese\b|\bjap\b|\bsub\b/.test(combined);
    const isMulti = emb.langHint === 'multi' || /\bmulti[\s-]?audio\b|\bdual[\s-]?audio\b/.test(combined);

    if (reqAudio === 'hi') {
      if (isHindi) score += 100;
      else if (isMulti) score += 60;
      else if (isEnglish || isJapanese) score -= 20;
    } else if (reqAudio === 'es') {
      if (isSpanish) score += 100;
      else if (isMulti) score += 60;
      else if (isEnglish || isJapanese) score -= 20;
    } else if (reqAudio === 'en') {
      if (isEnglish && !isHindi && !isSpanish) score += 80;
      else if (isMulti) score += 45;
      else if (isHindi || isSpanish) score -= 30;
    } else if (reqAudio === 'ja') {
      if (isJapanese && !isHindi && !isSpanish) score += 80;
      else if (isHindi || isSpanish) score -= 30;
    }

    if (preferHd2 && idx === 1) score += 15;
    return { emb, idx, score };
  });

  indexed.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.idx - b.idx));
  return indexed.map((item) => item.emb);
}

/**
 * Unpacks Dean Edwards `eval(function(p,a,c,k,e,d){...})` obfuscated player scripts
 * commonly used by StreamWish / Filemoon / Vidhide / custom extension embeds.
 */
export function unpackDeanEdwardsPacker(source: string): string {
  const packerRe =
    /eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]*?\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([^']*)'\.split\('\|'\)/i;
  const match = source.match(packerRe);
  if (!match) return source;
  const payload = match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  const radix = Number.parseInt(match[2], 10);
  const count = Number.parseInt(match[3], 10);
  const symtab = match[4].split('|');
  if (!Number.isFinite(radix) || radix < 2 || radix > 62 || symtab.length === 0 || count <= 0) {
    return source;
  }

  const encodeBase = (val: number): string => {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (val < radix) {
      return val < 36 ? val.toString(36) : String.fromCharCode(val + 29);
    }
    return encodeBase(Math.floor(val / radix)) + chars[val % radix];
  };

  const dict = new Map<string, string>();
  for (let i = 0; i < Math.min(count, symtab.length); i++) {
    const key = encodeBase(i);
    dict.set(key, symtab[i] || key);
  }

  return payload.replace(/\b\w+\b/g, (word) => dict.get(word) ?? word);
}

/**
 * Extracts direct playable HLS (.m3u8) or MP4 stream URLs from embed/player HTML or JS.
 */
export function extractDirectVideoUrlFromHtmlOrScript(
  html: string,
  baseUrl: string,
): string | null {
  const unpacked = unpackDeanEdwardsPacker(html);
  const combined = `${html}\n${unpacked}`;

  const tryNormalize = (raw: string): string | null => {
    const cleaned = decodeHtmlEntities(raw).replace(/\\\//g, '/').trim();
    if (!cleaned || cleaned.startsWith('data:') || cleaned.startsWith('blob:')) return null;
    if (/thumbnails\.vtt|\.vtt(?:\?|$)/i.test(cleaned)) return null;
    try {
      const abs = new URL(cleaned, baseUrl).toString();
      return /^https?:\/\//i.test(abs) ? abs : null;
    } catch {
      return null;
    }
  };

  // Priority 1: Explicit m3u8 URLs
  const m3u8Matches = combined.match(/https?:\/\/[^\s"'<>\\]+\.m3u8(?:[^\s"'<>\\]*)/gi) || [];
  for (const cand of m3u8Matches) {
    const normalized = tryNormalize(cand);
    if (normalized) return normalized;
  }

  // Priority 2: JSON/JS player config fields: sources: [{ file: "..." }], file: "...", hls.loadSource("...")
  const configPatterns = [
    /(?:sources?\s*:\s*\[\s*\{[^}]*?(?:file|src|url)\s*:\s*["'])([^"']+)["']/i,
    /\bfile\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i,
    /loadSource\(\s*["']([^"']+)["']\s*\)/i,
    /<source[^>]+src=["']([^"']+)["']/i,
    /<video[^>]+src=["']([^"']+)["']/i,
  ];
  for (const re of configPatterns) {
    const m = combined.match(re);
    if (m?.[1]) {
      const normalized = tryNormalize(m[1]);
      if (normalized) return normalized;
    }
  }

  // Priority 3: Direct MP4 URLs
  const mp4Matches = combined.match(/https?:\/\/[^\s"'<>\\]+\.mp4(?:[^\s"'<>\\]*)/gi) || [];
  for (const cand of mp4Matches) {
    const normalized = tryNormalize(cand);
    if (normalized) return normalized;
  }

  return null;
}

