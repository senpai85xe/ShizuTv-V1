import test from 'node:test';
import assert from 'node:assert/strict';
import {
  diagnoseAnimeExtensionServer,
  resolveAnimeEpisodeStream,
  resolveAnimeExtensionEpisodesServer,
  searchAnimeExtensionEntriesServer,
} from './animeStreamResolver.ts';

test('searchAnimeExtensionEntriesServer returns honest incompatibility for client-rendered Turnstile SPA extensions like Gotaku', async () => {
  const originalFetch = globalThis.fetch;
  const calledUrls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calledUrls.push(url);
    if (url.includes('/wp-json/')) {
      return new Response('Not Found', { status: 404 });
    }
    return new Response(
      '<!doctype html><html><head><title>Gotaku</title></head><body><div id="root"></div><script id="boot">{"turnstile_site_key":"0x4AAAA"}</script><script type="module" src="/assets/app.js"></script></body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html' } },
    );
  }) as typeof fetch;

  try {
    const res = await searchAnimeExtensionEntriesServer({
      sourceId: 'ext-yuzono-gotaku',
      sourceName: 'Gotaku',
      sourceBaseUrl: 'https://gotaku.to',
      query: 'Chainsaw Man',
    });

    assert.equal(res.compatible, false);
    assert.equal(res.items.length, 0);
    assert.ok(res.reason && /Turnstile|JavaScript app/i.test(res.reason));
    assert.ok(
      calledUrls.every((u) => u.startsWith('https://gotaku.to/')),
      'must query ONLY the selected extension host, never global AniList/Jikan or Inbuilt hosts',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchAnimeExtensionEntriesServer returns matching source entries and resolveAnimeEpisodeStream preserves direct selectedSourceEntry identity without re-searching', async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    requestedUrls.push(url);

    if (url.startsWith('https://custom-ext.example/?s=')) {
      return new Response(
        `
        <html><body>
          <div class="bsx">
            <a href="/anime/custom-alt-title-hindi/" title="Naruto Shippuuden Hindi Special">
              <img src="https://cdn.custom-ext.example/cover.jpg" />
            </a>
          </div>
          <div class="bsx">
            <a href="/anime/unrelated-show/" title="Unrelated Sidebar Show"></a>
          </div>
        </body></html>
        `,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }

    if (url === 'https://custom-ext.example/anime/custom-alt-title-hindi/') {
      return new Response(
        `<html><body><a href="/watch/custom-alt-title-hindi-episode-1/">Episode 1</a></body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }

    if (url === 'https://custom-ext.example/watch/custom-alt-title-hindi-episode-1/') {
      return new Response(
        `<html><body><video src="https://stream.custom-ext.example/video/ep1.m3u8"></video></body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }

    if (url === 'https://custom-ext.example/anime/custom-alt-title-hindi-episode-1') {
      return new Response('Not Found', { status: 404 });
    }

    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  try {
    const searchRes = await searchAnimeExtensionEntriesServer({
      sourceId: 'ext-custom-hindi',
      sourceName: 'Custom Hindi',
      sourceBaseUrl: 'https://custom-ext.example',
      sourceLang: 'hi',
      query: 'Naruto Shippuuden',
    });

    assert.equal(searchRes.compatible, true);
    assert.equal(searchRes.items.length, 1);
    const chosen = searchRes.items[0];
    assert.equal(chosen.sourceId, 'ext-custom-hindi');
    assert.equal(chosen.href, '/anime/custom-alt-title-hindi/');
    assert.equal(chosen.slug, 'anime/custom-alt-title-hindi');
    assert.equal(chosen.title, 'Naruto Shippuuden Hindi Special');
    assert.equal(chosen.cover, 'https://cdn.custom-ext.example/cover.jpg');

    requestedUrls.length = 0;

    // Now resolve stream using the selected source entry — should NOT call /?s= search again
    const stream = await resolveAnimeEpisodeStream({
      mediaId: '1735',
      titles: { english: 'Naruto: Shippuden', romaji: 'Naruto: Shippuden' },
      episodeNumber: 1,
      category: 'dub',
      audioLanguage: 'hi',
      sourceId: 'ext-custom-hindi',
      sourceName: 'Custom Hindi',
      sourceBaseUrl: 'https://custom-ext.example',
      sourceLang: 'hi',
      selectedSourceEntry: chosen,
      bypassCache: true,
    });

    assert.equal(stream.sourceId, 'ext-custom-hindi');
    assert.equal(stream.matchedTitle, 'Naruto Shippuuden Hindi Special');
    assert.equal(stream.matchedSlug, 'anime/custom-alt-title-hindi');
    assert.ok(stream.rawUrl.includes('https://stream.custom-ext.example/video/ep1.m3u8'));
    assert.equal(
      requestedUrls.some((u) => u.includes('?s=') || u.includes('search')),
      false,
      'direct selectedSourceEntry must bypass title re-searching and resolve straight from selected href/slug',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resolveAnimeEpisodeStream ignores selectedSourceEntry when sourceId belongs to a different source or Inbuilt', async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    requestedUrls.push(url);
    if (url.includes('gogoanimes.fi/search.html?keyword=')) {
      return new Response(
        '<p class="name"><a href="/category/chainsaw-man" title="Chainsaw Man">Chainsaw Man</a></p>',
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }
    if (url.includes('gogoanimes.fi/chainsaw-man-episode-1')) {
      return new Response(
        '<video src="https://cdn.gogo.example/chainsaw-ep1.m3u8"></video>',
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }
    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  try {
    const stream = await resolveAnimeEpisodeStream({
      mediaId: '127230',
      titles: { english: 'Chainsaw Man', romaji: 'Chainsaw Man' },
      episodeNumber: 1,
      category: 'sub',
      audioLanguage: 'ja',
      sourceId: 'shonenx-hls-inbuilt',
      sourceName: 'ShizuTv Stream (Inbuilt)',
      selectedSourceEntry: {
        sourceId: 'ext-some-other',
        title: 'Stale Wrong Source Entry',
        href: '/stale-wrong-entry/',
        slug: 'stale-wrong-entry',
      },
      bypassCache: true,
    });

    assert.equal(stream.sourceId, 'shonenx-hls-inbuilt');
    assert.equal(stream.matchedSlug, 'chainsaw-man');
    assert.equal(
      requestedUrls.some((u) => u.includes('stale-wrong-entry')),
      false,
      'stale selectedSourceEntry from another extension must never leak into Inbuilt playback',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resolveAnimeExtensionEpisodesServer loads source-specific episodes with non-standard numbering and passes direct episode ID/URL into resolveAnimeEpisodeStream', async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    requestedUrls.push(url);

    if (url === 'https://ext-series.example/anime/cour-two-hindi/') {
      return new Response(
        `
        <html><body>
          <div class="eplister">
            <ul>
              <li>
                <a href="/player/cour-two-special-part-13/" data-id="src-ep-1301">
                  <div class="epl-num">13</div>
                  <div class="epl-title">The Crimson Oath (Cour 2 Start)</div>
                </a>
              </li>
              <li>
                <a href="/player/cour-two-oath-broken-14/" data-id="src-ep-1402">
                  <div class="epl-num">14</div>
                  <div class="epl-title">Ashes Beneath Snow</div>
                </a>
              </li>
            </ul>
          </div>
        </body></html>
        `,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }

    if (url === 'https://ext-series.example/player/cour-two-oath-broken-14/') {
      return new Response(
        `<html><body><video src="https://cdn.ext-series.example/hls/cour2-ep14.m3u8"></video></body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }

    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  try {
    const epRes = await resolveAnimeExtensionEpisodesServer({
      sourceId: 'ext-cour2',
      sourceName: 'Cour2 Source',
      sourceBaseUrl: 'https://ext-series.example',
      sourceLang: 'hi',
      selectedSourceEntry: {
        sourceId: 'ext-cour2',
        title: 'Cour Two Hindi',
        href: '/anime/cour-two-hindi/',
        slug: 'anime/cour-two-hindi',
      },
      bypassCache: true,
    });

    assert.equal(epRes.compatible, true);
    assert.equal(epRes.episodes.length, 2);
    assert.deepEqual(
      epRes.episodes.map((e) => ({
        number: e.number,
        title: e.title,
        sourceId: e.sourceId,
        sourceEpisodeId: e.sourceEpisodeId,
        episodeUrl: e.episodeUrl,
        sourceAnimeHref: e.sourceAnimeHref,
        sourceAnimeSlug: e.sourceAnimeSlug,
      })),
      [
        {
          number: 13,
          title: 'The Crimson Oath (Cour 2 Start)',
          sourceId: 'ext-cour2',
          sourceEpisodeId: 'src-ep-1301',
          episodeUrl: '/player/cour-two-special-part-13/',
          sourceAnimeHref: '/anime/cour-two-hindi/',
          sourceAnimeSlug: 'anime/cour-two-hindi',
        },
        {
          number: 14,
          title: 'Ashes Beneath Snow',
          sourceId: 'ext-cour2',
          sourceEpisodeId: 'src-ep-1402',
          episodeUrl: '/player/cour-two-oath-broken-14/',
          sourceAnimeHref: '/anime/cour-two-hindi/',
          sourceAnimeSlug: 'anime/cour-two-hindi',
        },
      ],
    );

    assert.ok(
      requestedUrls.every((u) => u.startsWith('https://ext-series.example/')),
      'must resolve episodes exclusively from selected external host, never AniList/Jikan/AniZip/Kitsu',
    );

    requestedUrls.length = 0;

    const chosenEp = epRes.episodes[1];
    const stream = await resolveAnimeEpisodeStream({
      mediaId: '99999',
      titles: { english: 'Global Title Mismatch' },
      episodeNumber: chosenEp.number,
      category: 'dub',
      audioLanguage: 'hi',
      sourceId: 'ext-cour2',
      sourceName: 'Cour2 Source',
      sourceBaseUrl: 'https://ext-series.example',
      sourceLang: 'hi',
      selectedSourceEntry: {
        sourceId: 'ext-cour2',
        title: 'Cour Two Hindi',
        href: '/anime/cour-two-hindi/',
        slug: 'anime/cour-two-hindi',
      },
      selectedEpisode: chosenEp,
      bypassCache: true,
    });

    assert.equal(stream.matchedEpisode, 14);
    assert.equal(stream.sourceId, 'ext-cour2');
    assert.ok(stream.rawUrl.includes('https://cdn.ext-series.example/hls/cour2-ep14.m3u8'));
    assert.deepEqual(
      requestedUrls,
      ['https://ext-series.example/player/cour-two-oath-broken-14/'],
      'must hit the selected episode URL directly without re-searching or guessing Ep 14 URLs',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resolveAnimeExtensionEpisodesServer returns honest unavailability without fake fallback episodes when episode list is missing or SPA', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      '<!doctype html><html><head><title>Gotaku</title></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html' } },
    )) as typeof fetch;

  try {
    const spaRes = await resolveAnimeExtensionEpisodesServer({
      sourceId: 'ext-gotaku',
      sourceName: 'Gotaku',
      sourceBaseUrl: 'https://gotaku.to',
      selectedSourceEntry: {
        sourceId: 'ext-gotaku',
        title: 'Chainsaw Man',
        href: '/anime/chainsaw-man',
        slug: 'anime/chainsaw-man',
      },
      bypassCache: true,
    });
    assert.equal(spaRes.compatible, false);
    assert.deepEqual(spaRes.episodes, []);
    assert.ok(spaRes.reason && /JavaScript app|unavailable|supported/i.test(spaRes.reason));
  } finally {
    globalThis.fetch = originalFetch;
  }

  // Also ensure empty static series pages return [] and NEVER fabricate fake 1..12 episodes
  globalThis.fetch = (async () =>
    new Response('<html><body><h1>Title Removed</h1><p>No episodes available.</p></body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })) as typeof fetch;

  try {
    const emptyRes = await resolveAnimeExtensionEpisodesServer({
      sourceId: 'ext-empty',
      sourceName: 'EmptyExt',
      sourceBaseUrl: 'https://empty-ext.example',
      selectedSourceEntry: {
        sourceId: 'ext-empty',
        title: 'Removed Show',
        href: '/anime/removed-show/',
        slug: 'anime/removed-show',
      },
      bypassCache: true,
    });
    assert.equal(emptyRes.compatible, false);
    assert.deepEqual(emptyRes.episodes, []);
    assert.ok(emptyRes.reason && /No episode list could be retrieved/i.test(emptyRes.reason));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Gotaku uses public /api/v1/titles JSON for search while reporting encrypted/Turnstile episodes and playback honestly', async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    requestedUrls.push(url);

    if (url.startsWith('https://gotaku.to/api/v1/titles?q=')) {
      const q = new URL(url).searchParams.get('q') || '';
      if (/nonexistent/i.test(q)) {
        return new Response(
          JSON.stringify({ data: [], meta: { page: 1, limit: 24, has_more: false, total: 0 } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 'lwk4qj',
              url: '/title/lwk4qj',
              watch_url: '/title/lwk4qj?ep=1',
              name: 'Chainsaw Man',
              poster_url: 'https://s4.anilist.co/chainsaw.png',
            },
            {
              id: 'other1',
              url: '/title/other1',
              name: 'Unrelated Show',
              poster_url: null,
            },
          ],
          meta: { page: 1, limit: 24, has_more: false, total: 2 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (url === 'https://gotaku.to/api/v1/titles/lwk4qj/episodes') {
      return new Response(
        JSON.stringify({ message: 'A new version of the site is available. Reload the page.' }),
        { status: 426, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  try {
    // 1. Real Gotaku search matches Chainsaw Man and filters unrelated items
    const found = await searchAnimeExtensionEntriesServer({
      sourceId: 'ext-ay-5194074774836006982',
      sourceName: 'Gotaku',
      sourceBaseUrl: 'https://gotaku.to',
      query: 'Chainsaw Man',
    });
    assert.equal(found.compatible, true);
    assert.equal(found.items.length, 1);
    assert.deepEqual(found.items[0], {
      sourceId: 'ext-ay-5194074774836006982',
      title: 'Chainsaw Man',
      href: '/title/lwk4qj',
      slug: 'title/lwk4qj',
      cover: 'https://s4.anilist.co/chainsaw.png',
    });

    // 2. Non-existent title returns [] from Gotaku without AniList/Jikan fallback
    const missing = await searchAnimeExtensionEntriesServer({
      sourceId: 'ext-ay-5194074774836006982',
      sourceName: 'Gotaku',
      sourceBaseUrl: 'https://gotaku.to',
      query: 'NonExistentAnime999',
    });
    assert.equal(missing.compatible, true);
    assert.deepEqual(missing.items, []);

    assert.ok(
      requestedUrls.every((u) => u.startsWith('https://gotaku.to/')),
      'Gotaku adapter must never hit external metadata APIs like AniList/Jikan',
    );

    // 3. Episode loading honestly reports unsupported encrypted/Turnstile gate with zero fake episodes
    const epRes = await resolveAnimeExtensionEpisodesServer({
      sourceId: 'ext-ay-5194074774836006982',
      sourceName: 'Gotaku',
      sourceBaseUrl: 'https://gotaku.to',
      selectedSourceEntry: found.items[0],
      bypassCache: true,
    });
    assert.equal(epRes.compatible, false);
    assert.deepEqual(epRes.episodes, []);
    assert.ok(epRes.reason && /Turnstile|encrypted/i.test(epRes.reason));

    // 4. Playback rejects with clear unsupported message instead of claiming "No matching anime entries"
    await assert.rejects(
      () =>
        resolveAnimeEpisodeStream({
          mediaId: '127230',
          titles: { english: 'Chainsaw Man' },
          episodeNumber: 1,
          sourceId: 'ext-ay-5194074774836006982',
          sourceName: 'Gotaku',
          sourceBaseUrl: 'https://gotaku.to',
          selectedSourceEntry: found.items[0],
          bypassCache: true,
        }),
      /Turnstile|encrypted/i,
    );

    // 5. Diagnostics: basic verifies search (partial); full marks Gotaku unsupported for playback (never pass)
    const basicDiag = await diagnoseAnimeExtensionServer({
      sourceId: 'ext-ay-5194074774836006982',
      sourceName: 'Gotaku',
      sourceBaseUrl: 'https://gotaku.to',
      mode: 'basic',
      query: 'Chainsaw Man',
    });
    assert.equal(basicDiag.status, 'partial');
    assert.equal(basicDiag.matchedTitle, 'Chainsaw Man');
    assert.equal(basicDiag.capabilities.metadataSearch, 'verified');

    const fullDiag = await diagnoseAnimeExtensionServer({
      sourceId: 'ext-ay-5194074774836006982',
      sourceName: 'Gotaku',
      sourceBaseUrl: 'https://gotaku.to',
      mode: 'full',
      query: 'Chainsaw Man',
    });
    assert.equal(fullDiag.status, 'unsupported');
    assert.equal(fullDiag.capabilities.metadataSearch, 'verified');
    assert.equal(fullDiag.capabilities.episodeOrChapterListing, 'unsupported');
    assert.equal(fullDiag.capabilities.playbackOrReader, 'unsupported');
    assert.equal(fullDiag.capabilities.overallCompatibility, 'unsupported');
  } finally {
    globalThis.fetch = originalFetch;
  }
});


