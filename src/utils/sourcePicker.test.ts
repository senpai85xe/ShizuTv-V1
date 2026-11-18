import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterAvailableSources,
  formatSourceAvailabilityLabel,
  getSourceManagerBadge,
} from './sourcePicker';
import { SourceInfo } from '../types/media';

const SAMPLE_SOURCES: SourceInfo[] = [
  {
    id: 'shonenx-hls-inbuilt',
    name: 'ShizuTv Stream (Inbuilt)',
    type: 'inbuilt',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '2.1.5',
  },
  {
    id: 'ext-ay-gotaku-en',
    name: 'GOTAKU',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '1.2.0',
    isNsfw: true,
    baseUrl: 'https://gogoanime.example',
  },
  {
    id: 'ext-my-hianime',
    name: 'HiAnime',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'multi',
    version: '1.0.4',
  },
];

test('getSourceManagerBadge maps source id prefixes and inbuilt type cleanly', () => {
  assert.equal(getSourceManagerBadge(SAMPLE_SOURCES[0]), 'Inbuilt');
  assert.equal(getSourceManagerBadge(SAMPLE_SOURCES[1]), 'Aniyomi');
  assert.equal(getSourceManagerBadge(SAMPLE_SOURCES[2]), 'Mangayomi');
  assert.equal(
    getSourceManagerBadge({ id: 'ext-cs-cloud', type: 'extension' }),
    'CloudStream',
  );
  assert.equal(
    getSourceManagerBadge({ id: 'hianime-bridge', type: 'extension' }),
    'Extension',
  );
});

test('filterAvailableSources filters by name, manager badge, language, and baseUrl', () => {
  assert.equal(filterAvailableSources(SAMPLE_SOURCES, '').length, 3);
  assert.deepEqual(
    filterAvailableSources(SAMPLE_SOURCES, 'gotaku').map((s) => s.id),
    ['ext-ay-gotaku-en'],
  );
  assert.deepEqual(
    filterAvailableSources(SAMPLE_SOURCES, 'aniyomi').map((s) => s.id),
    ['ext-ay-gotaku-en'],
  );
  assert.deepEqual(
    filterAvailableSources(SAMPLE_SOURCES, 'multi').map((s) => s.id),
    ['ext-my-hianime'],
  );
  assert.deepEqual(
    filterAvailableSources(SAMPLE_SOURCES, 'nonexistent'),
    [],
  );
});

test('formatSourceAvailabilityLabel formats loading, resolved count, status, and override flag', () => {
  assert.equal(
    formatSourceAvailabilityLabel({
      mediaType: 'ANIME',
      resolving: true,
      resolvedCount: 0,
    }),
    'Checking episode availability on source...',
  );

  assert.equal(
    formatSourceAvailabilityLabel({
      mediaType: 'ANIME',
      resolving: false,
      resolvedCount: 28,
      status: 'FINISHED',
      hasOverride: true,
    }),
    '28 episodes available · FINISHED · Custom title match',
  );

  assert.equal(
    formatSourceAvailabilityLabel({
      mediaType: 'MANGA',
      resolving: false,
      resolvedCount: 1,
    }),
    '1 chapter available',
  );
});
