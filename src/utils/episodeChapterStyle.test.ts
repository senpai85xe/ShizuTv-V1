import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EPISODE_CHAPTER_STYLE,
  EPISODE_CHAPTER_STYLE_ORDER,
  formatChapterMetaLine,
  formatEpisodeDurationLabel,
  formatEpisodeMetaLine,
  getEpisodeChapterContainerClass,
  getNextEpisodeChapterStyle,
  resolveEpisodeChapterStyle,
} from './episodeChapterStyle';

test('resolveEpisodeChapterStyle defaults to classic and preserves valid styles', () => {
  assert.equal(DEFAULT_EPISODE_CHAPTER_STYLE, 'classic');
  assert.equal(resolveEpisodeChapterStyle(undefined), 'classic');
  assert.equal(resolveEpisodeChapterStyle('unknown'), 'classic');
  for (const style of EPISODE_CHAPTER_STYLE_ORDER) {
    assert.equal(resolveEpisodeChapterStyle(style), style);
  }
});

test('getNextEpisodeChapterStyle cycles through all 5 styles in order', () => {
  assert.equal(getNextEpisodeChapterStyle('classic'), 'grid');
  assert.equal(getNextEpisodeChapterStyle('grid'), 'box');
  assert.equal(getNextEpisodeChapterStyle('box'), 'compact');
  assert.equal(getNextEpisodeChapterStyle('compact'), 'cover');
  assert.equal(getNextEpisodeChapterStyle('cover'), 'classic');
});

test('getEpisodeChapterContainerClass outputs distinct layout classes per style', () => {
  assert.match(getEpisodeChapterContainerClass('grid', false), /\bgrid-cols-2\b/);
  assert.match(getEpisodeChapterContainerClass('box', false), /\bgrid-cols-4\b/);
  assert.match(getEpisodeChapterContainerClass('compact', false), /\bdivide-y\b/);
  assert.match(getEpisodeChapterContainerClass('cover', false), /\bgrid-cols-1\b/);
  assert.match(getEpisodeChapterContainerClass('classic', true), /\bgrid-cols-1\b/);
});

test('formatEpisodeDurationLabel and meta formatters handle optional fields cleanly', () => {
  assert.equal(formatEpisodeDurationLabel(1440), '24m');
  assert.equal(formatEpisodeDurationLabel(0), null);
  assert.equal(
    formatEpisodeMetaLine({
      id: 'ep-1',
      number: 1,
      title: 'Pilot',
      airDate: '1mo ago',
      durationSeconds: 1440,
    }),
    '1mo ago · 24m',
  );
  assert.equal(
    formatEpisodeMetaLine({ id: 'ep-2', number: 2, title: 'Next' }),
    'Sub & Dub',
  );
  assert.equal(
    formatChapterMetaLine({
      id: 'ch-1',
      number: 1,
      title: 'Romance Dawn',
      scanlator: 'Official Release',
      pageCount: 19,
    }),
    'Official Release · 19 pages',
  );
});
