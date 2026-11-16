import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampEpisodeIndex,
  computeAutoSkipTarget,
  formatScrubberPercent,
  getEffectiveDurationSeconds,
  getEpisodeNavigationState,
} from './inlinePlayer';

test('clampEpisodeIndex clamps negative, NaN, and overflowing indices safely', () => {
  assert.equal(clampEpisodeIndex(-3, 12), 0);
  assert.equal(clampEpisodeIndex(15, 12), 11);
  assert.equal(clampEpisodeIndex(4, 12), 4);
  assert.equal(clampEpisodeIndex(Number.NaN, 12), 0);
  assert.equal(clampEpisodeIndex(2, 0), 0);
});

test('getEpisodeNavigationState resolves prev and next episode bounds accurately', () => {
  assert.deepEqual(getEpisodeNavigationState(0, 12), {
    hasPrev: false,
    hasNext: true,
    prevIndex: 0,
    nextIndex: 1,
  });
  assert.deepEqual(getEpisodeNavigationState(5, 12), {
    hasPrev: true,
    hasNext: true,
    prevIndex: 4,
    nextIndex: 6,
  });
  assert.deepEqual(getEpisodeNavigationState(11, 12), {
    hasPrev: true,
    hasNext: false,
    prevIndex: 10,
    nextIndex: 11,
  });
  assert.deepEqual(getEpisodeNavigationState(0, 1), {
    hasPrev: false,
    hasNext: false,
    prevIndex: 0,
    nextIndex: 0,
  });
});

test('formatScrubberPercent bounds percentage cleanly between 0 and 100', () => {
  assert.equal(formatScrubberPercent(0, 1435), 0);
  assert.equal(Math.round(formatScrubberPercent(705, 1435)), 49);
  assert.equal(formatScrubberPercent(2000, 1435), 100);
  assert.equal(formatScrubberPercent(10, 0), 0);
});

test('getEffectiveDurationSeconds prefers loaded video duration, then episode/media fallbacks', () => {
  assert.equal(getEffectiveDurationSeconds(1435, 1440, 24), 1435);
  assert.equal(getEffectiveDurationSeconds(0, 1380, 24), 1380);
  assert.equal(getEffectiveDurationSeconds(Number.NaN, undefined, 25), 1500);
  assert.equal(getEffectiveDurationSeconds(0, undefined, undefined), 1440);
});

test('computeAutoSkipTarget skips op/ed when enabled and active', () => {
  const intervals = [
    { startTime: 90, endTime: 180, skipType: 'op' },
    { startTime: 1320, endTime: 1410, skipType: 'ed' },
  ];
  assert.equal(computeAutoSkipTarget(95, intervals, false), null);
  assert.equal(computeAutoSkipTarget(95, intervals, true), 180);
  assert.equal(computeAutoSkipTarget(500, intervals, true), null);
  assert.equal(computeAutoSkipTarget(1350, intervals, true), 1410);
});
