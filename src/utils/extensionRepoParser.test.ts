import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafeExternalHttpUrl, parseExtensionRepoManifest } from './extensionRepoParser';

test('isSafeExternalHttpUrl rejects loopback, private LAN, and non-HTTP URLs', () => {
  assert.equal(
    isSafeExternalHttpUrl('https://raw.githubusercontent.com/yuzono/anime-repo/repo/index.min.json'),
    true,
  );
  assert.equal(isSafeExternalHttpUrl('http://localhost:3000/test.json'), false);
  assert.equal(isSafeExternalHttpUrl('http://127.0.0.1:8080/index.json'), false);
  assert.equal(isSafeExternalHttpUrl('http://169.254.169.254/latest/meta-data'), false);
  assert.equal(isSafeExternalHttpUrl('http://192.168.1.1/index.json'), false);
  assert.equal(isSafeExternalHttpUrl('file:///etc/passwd'), false);
});

test('parseExtensionRepoManifest parses Aniyomi index.min.json sub-sources accurately', () => {
  const result = parseExtensionRepoManifest(
    [
      {
        name: 'Aniyomi: HiAnime',
        pkg: 'eu.kanade.tachiyomi.animeextension.en.zoro',
        apk: 'aniyomi-en.zoro-v14.2.apk',
        lang: 'en',
        version: '14.2',
        nsfw: 0,
        sources: [
          {
            name: 'HiAnime',
            lang: 'en',
            id: '6706411382606718900',
            baseUrl: 'https://hianime.to',
          },
        ],
      },
    ],
    {
      repoUrl: 'https://raw.githubusercontent.com/yuzono/anime-repo/repo/index.min.json',
      manager: 'aniyomi',
    },
  );

  assert.equal(result.format, 'aniyomi');
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].name, 'HiAnime');
  assert.deepEqual(result.sources[0].mediaTypes, ['ANIME']);
  assert.equal(result.sources[0].baseUrl, 'https://hianime.to');
  assert.equal(result.sources[0].version, '14.2');
  assert.equal(result.sources[0].isNsfw, false);
});

test('parseExtensionRepoManifest parses Mangayomi index.json and CloudStream pluginLists', () => {
  const mangayomi = parseExtensionRepoManifest(
    [
      {
        name: 'AnimePahe',
        id: 123456,
        baseUrl: 'https://animepahe.ru',
        lang: 'en',
        typeSource: 'single',
        itemType: 1,
        version: '0.1.5',
        isNsfw: false,
      },
      {
        name: 'MangaDex',
        id: 7890,
        baseUrl: 'https://mangadex.org',
        lang: 'multi',
        typeSource: 'single',
        itemType: 0,
        version: '0.2.1',
        isNsfw: false,
      },
    ],
    {
      repoUrl: 'https://raw.githubusercontent.com/kodjodevf/mangayomi-extensions/main/index.json',
      manager: 'mangayomi',
    },
  );

  assert.equal(mangayomi.format, 'mangayomi');
  assert.equal(mangayomi.sources.length, 2);
  assert.deepEqual(mangayomi.sources[0].mediaTypes, ['ANIME']);
  assert.deepEqual(mangayomi.sources[1].mediaTypes, ['MANGA']);

  const cloudstreamWrapper = parseExtensionRepoManifest(
    {
      name: 'CloudStream Repo',
      pluginLists: ['https://example.com/plugins.json', 'http://127.0.0.1/evil.json'],
    },
    {
      repoUrl: 'https://example.com/repo.json',
      manager: 'cloudstream',
    },
  );

  assert.equal(cloudstreamWrapper.format, 'cloudstream');
  assert.equal(cloudstreamWrapper.repoName, 'CloudStream Repo');
  assert.deepEqual(cloudstreamWrapper.pluginListUrls, ['https://example.com/plugins.json']);
});
