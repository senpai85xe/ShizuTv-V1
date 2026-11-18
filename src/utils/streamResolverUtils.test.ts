import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchQueriesForMedia,
  buildStreamProxyUrl,
  detectAvailableAudiosFromSources,
  extractMegaPlayStreamUrl,
  mapSubtitleTracksFromSources,
  rewriteM3u8Manifest,
  scoreGogoSearchCandidate,
} from './streamResolverUtils';

test('buildSearchQueriesForMedia expands titles cleanly with punctuation-free and root fallbacks', () => {
  const queries = buildSearchQueriesForMedia({
    english: "Frieren: Beyond Journey's End",
    romaji: 'Sousou no Frieren',
    synonyms: ['Frieren at the Funeral'],
  });
  assert.ok(queries.includes("Frieren: Beyond Journey's End"));
  assert.ok(queries.includes('Frieren'));
  assert.ok(queries.includes('Sousou no Frieren'));
});

test('scoreGogoSearchCandidate prefers exact base series for SUB and -dub entry for DUB', () => {
  const candidates = [
    { href: '/category/frieren-beyond-journey-s-end-season-2', title: 'Frieren: Beyond Journey’s End Season 2' },
    { href: '/category/sousou-no-frieren-marumaru-no-mahou-mini-anime', title: 'Sousou no Frieren – Marumaru no Mahou (Mini Anime)' },
    { href: '/category/frieren-beyond-journey-s-end-dub', title: 'Frieren: Beyond Journey’s End (Dub)' },
    { href: '/category/frieren-beyond-journey-s-end', title: 'Frieren: Beyond Journey’s End' },
  ];

  const subSorted = [...candidates].sort(
    (a, b) =>
      scoreGogoSearchCandidate(b, {
        titles: ["Frieren: Beyond Journey's End", 'Sousou no Frieren'],
        category: 'sub',
        format: 'TV',
      }) -
      scoreGogoSearchCandidate(a, {
        titles: ["Frieren: Beyond Journey's End", 'Sousou no Frieren'],
        category: 'sub',
        format: 'TV',
      }),
  );
  assert.equal(subSorted[0].href, '/category/frieren-beyond-journey-s-end');

  const dubSorted = [...candidates].sort(
    (a, b) =>
      scoreGogoSearchCandidate(b, {
        titles: ["Frieren: Beyond Journey's End", 'Sousou no Frieren'],
        category: 'dub',
        format: 'TV',
      }) -
      scoreGogoSearchCandidate(a, {
        titles: ["Frieren: Beyond Journey's End", 'Sousou no Frieren'],
        category: 'dub',
        format: 'TV',
      }),
  );
  assert.equal(dubSorted[0].href, '/category/frieren-beyond-journey-s-end-dub');
});

test('scoreGogoSearchCandidate picks Naruto over Boruto Naruto Movie', () => {
  const candidates = [
    { href: '/category/boruto-naruto-the-movie', title: 'Boruto: Naruto the Movie' },
    { href: '/category/naruto-shippuden', title: 'Naruto Shippuden' },
    { href: '/category/naruto', title: 'Naruto' },
  ];
  const sorted = [...candidates].sort(
    (a, b) =>
      scoreGogoSearchCandidate(b, {
        titles: ['Naruto'],
        category: 'sub',
        format: 'TV',
      }) -
      scoreGogoSearchCandidate(a, {
        titles: ['Naruto'],
        category: 'sub',
        format: 'TV',
      }),
  );
  assert.equal(sorted[0].href, '/category/naruto');
});

test('rewriteM3u8Manifest rewrites variant playlists, keys, maps, and segments through proxy', () => {
  const manifest = [
    '#EXTM3U',
    '#EXT-X-KEY:METHOD=AES-128,URI="enc.key"',
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="jpn",URI="audio/index.m3u8"',
    '#EXT-X-STREAM-INF:BANDWIDTH=1310631,RESOLUTION=1920x1080',
    'index-f1-v1-a1.m3u8',
    '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=33272,URI="iframes.m3u8"',
    'https://cdn.example.com/segs/seg-1.jpg',
  ].join('\n');

  const baseUrl = 'https://fetch.nexabloom.top/anime/abc/master.m3u8';
  const referer = 'https://megaplay.buzz/';
  const out = rewriteM3u8Manifest(manifest, baseUrl, '/api/stream/proxy', referer);

  assert.ok(
    out.includes(
      `URI="${buildStreamProxyUrl('https://fetch.nexabloom.top/anime/abc/enc.key', '/api/stream/proxy', referer)}"`,
    ),
  );
  assert.ok(
    out.includes(
      `URI="${buildStreamProxyUrl('https://fetch.nexabloom.top/anime/abc/audio/index.m3u8', '/api/stream/proxy', referer)}"`,
    ),
  );
  assert.ok(
    out.includes(
      buildStreamProxyUrl('https://fetch.nexabloom.top/anime/abc/index-f1-v1-a1.m3u8', '/api/stream/proxy', referer),
    ),
  );
  assert.ok(
    out.includes(
      buildStreamProxyUrl('https://cdn.example.com/segs/seg-1.jpg', '/api/stream/proxy', referer),
    ),
  );
});

test('extractMegaPlayStreamUrl supports object, sources array, array, and string shapes', () => {
  assert.equal(
    extractMegaPlayStreamUrl({ file: 'https://cdn.example.com/master.m3u8' }),
    'https://cdn.example.com/master.m3u8',
  );
  assert.equal(
    extractMegaPlayStreamUrl({ sources: [{ file: 'https://cdn.example.com/s.m3u8' }] }),
    'https://cdn.example.com/s.m3u8',
  );
  assert.equal(extractMegaPlayStreamUrl({ file: 'not-a-url' }), null);
});

test('mapSubtitleTracksFromSources skips thumbnails, normalizes languages, assigns unique lang codes, and proxies VTT URLs', () => {
  const mapped = mapSubtitleTracksFromSources(
    [
      { file: 'https://cdn.example.com/thumbnails.vtt', kind: 'thumbnails' },
      { file: 'https://cdn.example.com/ar.vtt', label: 'Arabic', kind: 'captions' },
      { file: 'https://cdn.example.com/es-1.vtt', label: 'Spanish (Spain)', kind: 'captions' },
      { file: 'https://cdn.example.com/es-2.vtt', label: 'Spanish (Latin America)', kind: 'captions' },
      { file: 'https://cdn.example.com/es-3.vtt', label: 'Spanish - Castellano', kind: 'captions' },
      { file: 'https://cdn.example.com/eng.vtt', label: 'English', kind: 'captions', default: true },
    ],
    '/api/stream/proxy',
    'https://megaplay.buzz/',
  );
  assert.equal(mapped.length, 5);
  assert.equal(mapped[0].lang, 'en');
  assert.ok(mapped[0].url.startsWith('/api/stream/proxy?'));
  const langs = mapped.map((t) => t.lang);
  assert.equal(new Set(langs).size, langs.length);
  assert.ok(langs.includes('es'));
  assert.ok(langs.includes('es-la'));
  assert.ok(langs.includes('es-2'));
});

test('detectAvailableAudiosFromSources reports only actually present languages on the source', () => {
  const subOnly = detectAvailableAudiosFromSources({
    candidates: [
      { href: '/category/solo-leveling-arise', title: 'Solo Leveling Arise' },
      { href: '/category/unrelated-dub', title: 'Unrelated Show (Dub)' },
    ],
    targetTitles: ['Solo Leveling Arise'],
    currentCategory: 'sub',
    hasDubProbe: false,
  });
  assert.deepEqual(
    subOnly.map((a) => a.code),
    ['ja'],
  );

  const subAndDub = detectAvailableAudiosFromSources({
    candidates: [
      { href: '/category/my-hero-academia', title: 'My Hero Academia' },
      { href: '/category/my-hero-academia-dub', title: 'My Hero Academia (Dub)' },
    ],
    targetTitles: ['My Hero Academia'],
    currentCategory: 'sub',
    hasDubProbe: false,
  });
  assert.deepEqual(
    subAndDub.map((a) => a.code),
    ['ja', 'en'],
  );

  const viaProbe = detectAvailableAudiosFromSources({
    candidates: [{ href: '/category/kaguya-sama', title: 'Kaguya-sama' }],
    targetTitles: ['Kaguya-sama'],
    currentCategory: 'sub',
    hasDubProbe: true,
  });
  assert.deepEqual(
    viaProbe.map((a) => a.code),
    ['ja', 'en'],
  );
});

