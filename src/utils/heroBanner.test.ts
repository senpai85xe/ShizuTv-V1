import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterHomeSectionsByMediaMode,
  formatHeroMetadata,
  formatHeroScore,
  formatHeroSlideCounter,
  getHeroCtaLabel,
  getHeroRankBadgeLabel,
  isTrendingDiscoveryRow,
  resolveHeroBannerStyle,
  selectHeroSlides,
  stripHtmlTags,
  wrapSlideIndex,
} from './heroBanner';
import { HomeSection, UnifiedMedia } from '../types/media';

const makeMedia = (id: string, overrides: Partial<UnifiedMedia> = {}): UnifiedMedia => ({
  id,
  type: 'ANIME',
  title: { english: `Anime ${id}` },
  format: 'TV',
  year: 2024,
  score: 8.5,
  genres: ['Action', 'Adventure', 'Fantasy'],
  banner: `https://example.com/banner-${id}.jpg`,
  cover: `https://example.com/cover-${id}.jpg`,
  ...overrides,
});

test('wrapSlideIndex wraps forward and backward cleanly', () => {
  assert.equal(wrapSlideIndex(0, -1, 5), 4);
  assert.equal(wrapSlideIndex(4, 1, 5), 0);
  assert.equal(wrapSlideIndex(2, 1, 5), 3);
  assert.equal(wrapSlideIndex(0, 1, 0), 0);
});

test('stripHtmlTags removes tags and normalizes whitespace', () => {
  assert.equal(
    stripHtmlTags('<p>A boy fights...<br/>for the &quot;right death&quot; &amp; hope.</p>'),
    'A boy fights... for the "right death" & hope.',
  );
  assert.equal(stripHtmlTags(null), '');
});

test('formatHeroMetadata outputs format, year, and up to 2 genres', () => {
  const parts = formatHeroMetadata(makeMedia('1'));
  assert.deepEqual(parts, ['TV', '2024', 'Action', 'Adventure']);
});

test('formatHeroScore formats valid scores as X.Y/10', () => {
  assert.equal(formatHeroScore(8.5), '8.5/10');
  assert.equal(formatHeroScore(9), '9.0/10');
  assert.equal(formatHeroScore(null), null);
  assert.equal(formatHeroScore(0), null);
});

test('getHeroCtaLabel distinguishes watch vs read media types', () => {
  assert.equal(getHeroCtaLabel('ANIME'), 'Watch now');
  assert.equal(getHeroCtaLabel('MANGA'), 'Read now');
  assert.equal(getHeroCtaLabel('NOVEL'), 'Read now');
});

test('selectHeroSlides deduplicates and caps slides', () => {
  const list = [
    makeMedia('1'),
    makeMedia('1'),
    makeMedia('2'),
    makeMedia('3', { banner: null, cover: null }),
    makeMedia('4'),
    makeMedia('5'),
    makeMedia('6'),
    makeMedia('7'),
  ];
  const selected = selectHeroSlides(list, 5);
  assert.deepEqual(
    selected.map((s) => s.id),
    ['1', '2', '4', '5', '6'],
  );
});

test('getHeroRankBadgeLabel displays Series for anime and Manga for manga/novel', () => {
  assert.equal(getHeroRankBadgeLabel(0, 'ANIME'), '#1 in Series');
  assert.equal(getHeroRankBadgeLabel(1, 'MANGA'), '#2 in Manga');
  assert.equal(getHeroRankBadgeLabel(2, 'NOVEL'), '#3 in Manga');
});

test('filterHomeSectionsByMediaMode separates enabled Anime and Manga shelves cleanly', () => {
  const sections: HomeSection[] = [
    { id: 'cw', title: 'Continue Watching', type: 'continueMedia', disabled: false, targetMediaType: 'ANIME' },
    { id: 'ta', title: 'Trending Anime', type: 'discovery', disabled: false, targetMediaType: 'ANIME', trackerCategory: 'trending' },
    { id: 'cr', title: 'Continue Reading', type: 'continueMedia', disabled: false, targetMediaType: 'MANGA' },
    { id: 'tm', title: 'Trending Manga', type: 'discovery', disabled: false, targetMediaType: 'MANGA', trackerCategory: 'trending' },
    { id: 'pm', title: 'Popular Manga', type: 'discovery', disabled: true, targetMediaType: 'MANGA', trackerCategory: 'popular' },
  ];

  assert.deepEqual(
    filterHomeSectionsByMediaMode(sections, 'ANIME').map((s) => s.id),
    ['cw', 'ta'],
  );
  assert.deepEqual(
    filterHomeSectionsByMediaMode(sections, 'MANGA').map((s) => s.id),
    ['cr', 'tm'],
  );
  assert.equal(isTrendingDiscoveryRow(sections[1]!), true);
  assert.equal(isTrendingDiscoveryRow(sections[3]!), true);
  assert.equal(isTrendingDiscoveryRow(sections[0]!), false);
});

test('resolveHeroBannerStyle defaults to classic and preserves valid styles', () => {
  assert.equal(resolveHeroBannerStyle(undefined), 'classic');
  assert.equal(resolveHeroBannerStyle(null), 'classic');
  assert.equal(resolveHeroBannerStyle('unknown-style'), 'classic');
  assert.equal(resolveHeroBannerStyle('coverflow'), 'coverflow');
  assert.equal(resolveHeroBannerStyle('cinematic'), 'cinematic');
  assert.equal(resolveHeroBannerStyle('splitPoster'), 'splitPoster');
  assert.equal(resolveHeroBannerStyle('minimal'), 'minimal');
});

test('formatHeroSlideCounter formats zero-padded tabular counters safely', () => {
  assert.equal(formatHeroSlideCounter(0, 5), '01 / 05');
  assert.equal(formatHeroSlideCounter(4, 5), '05 / 05');
  assert.equal(formatHeroSlideCounter(9, 5), '05 / 05');
  assert.equal(formatHeroSlideCounter(0, 0), '00 / 00');
});
