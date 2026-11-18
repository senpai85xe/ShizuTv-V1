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

export function buildSearchQueriesForMedia(input: MediaSearchTitlesInput): string[] {
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

    // Remove apostrophes/punctuation (helps Gogo search tokenizer on e.g. "Journey's")
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

  return expanded.slice(0, 8);
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
  },
): number {
  const slug = extractSlugFromGogoHref(candidate.href).toLowerCase();
  const candNorm = normalizeTitleForMatch(candidate.title || slug.replace(/-/g, ' '));
  const slugNorm = normalizeTitleForMatch(slug.replace(/-/g, ' '));
  const candIsDub = /-dub(?:$|-)/i.test(slug) || /\(dub\)/i.test(candidate.title);

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

  // Audio category alignment (SUB vs DUB)
  if (target.category === 'dub') {
    bestScore += candIsDub ? 55 : -15;
  } else {
    bestScore += candIsDub ? -65 : 20;
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
  const seenLangs = new Set<string>();

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
    let lang = 'other';
    if (lower.includes('english')) lang = 'en';
    else if (lower.includes('japanese')) lang = 'ja';
    else if (lower.includes('spanish')) lang = 'es';
    else if (lower.includes('french')) lang = 'fr';
    else if (lower.includes('german')) lang = 'de';
    else if (lower.includes('italian')) lang = 'it';
    else if (lower.includes('portuguese')) lang = 'pt';
    else if (lower.includes('arabic')) lang = 'ar';
    else if (lower.includes('russian')) lang = 'ru';
    else lang = lower.replace(/[^a-z]/g, '').slice(0, 6) || 'sub';

    const uniqueKey = `${lang}:${label}`;
    if (seenLangs.has(uniqueKey)) continue;
    seenLangs.add(uniqueKey);

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
