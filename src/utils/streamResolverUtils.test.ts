import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchQueriesForMedia,
  buildStreamProxyUrl,
  buildStreamResolverCacheKey,
  detectAvailableAudiosFromSources,
  extractDirectVideoUrlFromHtmlOrScript,
  extractMegaPlayStreamUrl,
  HIANIME_BRIDGE_HOSTS,
  INBUILT_PRIMARY_HOSTS,
  isMetadataOnlyCatalogHost,
  isSourceInherentLanguage,
  isViableTitleMatch,
  mapSubtitleTracksFromSources,
  parseGenericEmbedCandidates,
  parseGenericEpisodeLinks,
  parseGenericSearchHtml,
  resolveProviderHostPlan,
  rewriteM3u8Manifest,
  scoreGogoSearchCandidate,
  sortEmbedsForAudioLanguage,
  unpackDeanEdwardsPacker,
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

test('resolveProviderHostPlan strictly isolates custom extensions and HiAnime bridge from ShizuTv fallback hosts', () => {
  const inbuiltPlan = resolveProviderHostPlan({
    sourceId: 'shonenx-hls-inbuilt',
    sourceName: 'ShizuTv Stream (Inbuilt)',
  });
  assert.equal(inbuiltPlan.mode, 'inbuilt');
  assert.deepEqual(inbuiltPlan.hosts, [...INBUILT_PRIMARY_HOSTS]);

  const hiPlan = resolveProviderHostPlan({
    sourceId: 'hianime-bridge',
    sourceName: 'AniWatch / HiAnime (Bridge)',
  });
  assert.equal(hiPlan.mode, 'hianime');
  assert.deepEqual(hiPlan.hosts, [...HIANIME_BRIDGE_HOSTS]);

  const customPlan = resolveProviderHostPlan({
    sourceId: 'ext-ay-animehindiworld',
    sourceName: 'AnimeHindiWorld',
    sourceBaseUrl: 'https://animehindiworld.example.com/',
  });
  assert.equal(customPlan.mode, 'custom-extension');
  assert.deepEqual(customPlan.hosts, ['https://animehindiworld.example.com']);

  const missingHostPlan = resolveProviderHostPlan({
    sourceId: 'ext-ay-broken',
    sourceName: 'BrokenExt',
    sourceBaseUrl: '',
  });
  assert.equal(missingHostPlan.mode, 'missing-host');
  assert.deepEqual(missingHostPlan.hosts, []);
});

test('buildStreamResolverCacheKey separates entries by sourceId, sourceBaseUrl, sourceLang, and audioLanguage', () => {
  const keyShizuEn = buildStreamResolverCacheKey({
    mediaId: '20',
    english: 'Naruto',
    episodeNumber: 1,
    category: 'dub',
    audioLanguage: 'en',
    sourceId: 'shonenx-hls-inbuilt',
  });
  const keyExtHi = buildStreamResolverCacheKey({
    mediaId: '20',
    english: 'Naruto',
    episodeNumber: 1,
    category: 'dub',
    audioLanguage: 'hi',
    sourceId: 'ext-hindi',
    sourceBaseUrl: 'https://hindi.example.com',
    sourceLang: 'hi',
  });
  assert.notEqual(keyShizuEn, keyExtHi);
});

test('scoreGogoSearchCandidate and buildSearchQueriesForMedia prioritize Hindi and Spanish candidates when requested', () => {
  const queries = buildSearchQueriesForMedia({ english: 'Naruto' }, 'hi');
  assert.ok(queries.some((q) => /naruto hindi/i.test(q)));

  const candidates = [
    { href: '/naruto-dub', title: 'Naruto (Dub)' },
    { href: '/naruto-hindi-dub', title: 'Naruto Hindi Dubbed' },
    { href: '/naruto', title: 'Naruto' },
  ];
  const rankedHi = [...candidates].sort(
    (a, b) =>
      scoreGogoSearchCandidate(b, { titles: ['Naruto'], category: 'dub', audioLanguage: 'hi' }) -
      scoreGogoSearchCandidate(a, { titles: ['Naruto'], category: 'dub', audioLanguage: 'hi' }),
  );
  assert.equal(rankedHi[0].href, '/naruto-hindi-dub');

  assert.equal(
    isSourceInherentLanguage('hi', 'ToonStream', 'https://toonstream.example', 'hi'),
    true,
  );
  assert.equal(
    isSourceInherentLanguage('en', 'HiAnime', 'https://hianime.to', 'hi'),
    false,
  );
});

test('generic site search, episode links, embed sorting, and packer video extraction work cleanly', () => {
  const searchHtml = `
    <article class="result-item">
      <a href="https://hindi.example.com/series/naruto-hindi/" title="Naruto (Hindi Dub)">
        <h3 class="title">Naruto (Hindi Dub)</h3>
      </a>
    </article>
  `;
  const found = parseGenericSearchHtml(searchHtml, 'https://hindi.example.com');
  assert.equal(found.length, 1);
  assert.equal(found[0].href, '/series/naruto-hindi/');

  const seriesHtml = `
    <div class="episodes">
      <a href="/episode/naruto-hindi-1x1/" data-number="1">Ep 1</a>
      <a href="/episode/naruto-hindi-1x2/" data-number="2">Ep 2</a>
    </div>
  `;
  const epLinks = parseGenericEpisodeLinks(seriesHtml, 'https://hindi.example.com', 2);
  assert.equal(epLinks[0], 'https://hindi.example.com/episode/naruto-hindi-1x2/');

  const epHtml = `
    <ul>
      <li><a data-video="https://player.example.com/eng/123" data-lang="English">Server EN</a></li>
      <li><a data-video="https://player.example.com/hindi/456" data-lang="Hindi">Server Hindi</a></li>
    </ul>
  `;
  const embeds = parseGenericEmbedCandidates(epHtml, 'https://hindi.example.com/episode/naruto-hindi-1x2/');
  const sortedForHi = sortEmbedsForAudioLanguage(embeds, { audioLanguage: 'hi' });
  assert.equal(sortedForHi[0].url, 'https://player.example.com/hindi/456');

  const packed = `eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p}('0 1="2://3.4/5.6";',7,7,'var|src|https|cdn|example|master|m3u8'.split('|'),0,{}))`;
  const unpacked = unpackDeanEdwardsPacker(packed);
  assert.ok(unpacked.includes('https://cdn.example/master.m3u8'));
  const direct = extractDirectVideoUrlFromHtmlOrScript(packed, 'https://player.example.com');
  assert.equal(direct, 'https://cdn.example/master.m3u8');

  const hindiAudios = detectAvailableAudiosFromSources({
    candidates: [{ href: '/series/naruto-hindi', title: 'Naruto Hindi' }],
    targetTitles: ['Naruto'],
    currentCategory: 'dub',
    currentAudioLanguage: 'hi',
    embedLangHints: ['hi'],
  });
  assert.deepEqual(
    hindiAudios.map((a) => a.code),
    ['hi'],
  );

  const queryEpsHtml = `
    <a href="/watch/naruto?ep=1">Episode 1</a>
    <a href="/watch/naruto?ep=5">Episode 5</a>
  `;
  const ep5Links = parseGenericEpisodeLinks(queryEpsHtml, 'https://hindi.example.com', 5);
  assert.equal(ep5Links[0], 'https://hindi.example.com/watch/naruto?ep=5');
});

test('isViableTitleMatch rejects unrelated schoolgirl movie on The God of War and checks metadata-only hosts', () => {
  const queries = buildSearchQueriesForMedia({
    english: 'The God of War',
    romaji: 'Zhan Shen',
  });
  assert.ok(!queries.includes('The'), 'must not fall back to bare stop-word query "The"');

  assert.equal(
    isViableTitleMatch(
      { href: '/category/girls-und-panzer-the-movie', title: 'Girls und Panzer: The Movie' },
      ['The God of War', 'Zhan Shen'],
      'ONA',
    ),
    false,
  );
  assert.equal(
    isViableTitleMatch(
      { href: '/category/the-god-of-war-donghua', title: 'The God of War' },
      ['The God of War', 'Zhan Shen'],
      'ONA',
    ),
    true,
  );

  assert.equal(isMetadataOnlyCatalogHost('https://anidb.net', 'AniDB'), true);
  assert.equal(isMetadataOnlyCatalogHost('https://myanimelist.net/anime', 'MAL'), true);
  assert.equal(isMetadataOnlyCatalogHost('https://animexin.dev', 'AnimeXin'), false);
});

test('parseGenericSearchHtml survives nested divs and parseGenericEmbedCandidates decodes base64 mirror options and atob()', () => {
  const nestedCardHtml = `
    <div class="bsx">
      <a href="https://animexin.example/zhan-shen-the-god-of-war/" title="Zhan Shen (The God of War)">
        <div class="limit"><div class="typez ONA">ONA</div><img src="poster.jpg" /></div>
        <div class="tt">The God of War<h2>Zhan Shen</h2></div>
      </a>
    </div>
  `;
  const cards = parseGenericSearchHtml(nestedCardHtml, 'https://animexin.example');
  assert.equal(cards.length, 1);
  assert.equal(cards[0].href, '/zhan-shen-the-god-of-war/');
  assert.ok(/god of war|zhan shen/i.test(cards[0].title));

  const epListHtml = `
    <a href="https://animexin.example/zhan-shen-episode-01-hindi-sub/">Ep 1</a>
    <a href="https://animexin.example/zhan-shen-episode-02-hindi-sub/">Ep 2</a>
  `;
  const eps = parseGenericEpisodeLinks(epListHtml, 'https://animexin.example', 1);
  assert.equal(eps[0], 'https://animexin.example/zhan-shen-episode-01-hindi-sub/');

  const encodedIframe = Buffer.from('<iframe src="https://mirror.example/e/hindi-1" allowfullscreen></iframe>').toString('base64');
  const mirrorHtml = `
    <select class="mirror">
      <option value="">Select Video Server</option>
      <option value="${encodedIframe}">Server Hindi Mirror</option>
    </select>
  `;
  const embeds = parseGenericEmbedCandidates(mirrorHtml, 'https://animexin.example/ep-1/');
  assert.equal(embeds.length, 1);
  assert.equal(embeds[0].url, 'https://mirror.example/e/hindi-1');
  assert.equal(embeds[0].langHint, 'hi');

  const encodedStreamUrl = Buffer.from('https://cdn.mirror.example/hls/master.m3u8').toString('base64');
  const atobHtml = `<script>var s = atob("${encodedStreamUrl}");</script>`;
  assert.equal(
    extractDirectVideoUrlFromHtmlOrScript(atobHtml, 'https://mirror.example/e/hindi-1'),
    'https://cdn.mirror.example/hls/master.m3u8',
  );
});



