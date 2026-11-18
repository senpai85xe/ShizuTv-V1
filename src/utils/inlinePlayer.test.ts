import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFallbackEpisodesCount } from '../services/sourceEngine';
import {
  buildHlsQualityOptions,
  buildSubtitleBoxCssProps,
  clampEpisodeIndex,
  computeAutoSkipTarget,
  computeFullscreenRotationStage,
  DEFAULT_AMBIENT_ENABLED,
  DEFAULT_AUTO_PIP_ENABLED,
  findActiveSubtitleCue,
  formatQualityLabel,
  formatScrubberPercent,
  getCommentsScopeKey,
  getEffectiveDurationSeconds,
  getEpisodeNavigationState,
  getNextVideoFitMode,
  getVideoFitBadgeLabel,
  getVideoFitClass,
  parseSubtitleSegments,
  parseSubtitleText,
  PLAYBACK_SPEED_OPTIONS,
  resolveAudioLanguageOption,
  resolveAvailableAudioOptions,
  resolveBatterySaverHlsLevel,
  resolveEffectiveStreamQuality,
  resolvePreferredHlsLevel,
  shouldAutoStartPlayback,
  shouldHideBarsForOverlay,
  shouldShowFullscreenControls,
  stripSubtitleTags,
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

test('shouldAutoStartPlayback keeps playback paused when autoPlayPref is false unless explicitly triggered', () => {
  assert.equal(shouldAutoStartPlayback(false, false), false);
  assert.equal(shouldAutoStartPlayback(true, false), true);
  assert.equal(shouldAutoStartPlayback(false, true), true);
});

test('getVideoFitClass maps fit modes to proper CSS object-fit classes', () => {
  assert.equal(getVideoFitClass('contain'), 'object-contain');
  assert.equal(getVideoFitClass('cover'), 'object-cover');
  assert.equal(getVideoFitClass('fill'), 'object-fill');
});

test('buildHlsQualityOptions and resolvePreferredHlsLevel format and select resolutions accurately', () => {
  const levels = [
    { height: 360, bitrate: 800_000 },
    { height: 720, bitrate: 2_500_000 },
    { height: 1080, bitrate: 5_000_000 },
  ];
  assert.equal(formatQualityLabel(1080, 5_000_000), '1080p');
  const opts = buildHlsQualityOptions(levels);
  assert.deepEqual(
    opts.map((o) => ({ index: o.index, label: o.label })),
    [
      { index: -1, label: 'Auto' },
      { index: 2, label: '1080p' },
      { index: 1, label: '720p' },
      { index: 0, label: '360p' },
    ],
  );
  assert.equal(resolvePreferredHlsLevel(levels, 'auto'), -1);
  assert.equal(resolvePreferredHlsLevel(levels, '720p'), 1);
  assert.equal(resolvePreferredHlsLevel(levels, '1080p'), 2);
});

test('findActiveSubtitleCue respects timing offset and parseSubtitleText parses SRT/VTT', () => {
  const cues = parseSubtitleText(`WEBVTT

1
00:00:02.000 --> 00:00:06.000
Hello world

2
00:00:08,000 --> 00:00:12,000
Second line`);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, 'Hello world');
  assert.equal(cues[1].start, 8);
  assert.equal(findActiveSubtitleCue(cues, 3, 0)?.text, 'Hello world');
  // +2s offset delays the subtitle so at t=3 it has not appeared yet, while at t=5 it shows
  assert.equal(findActiveSubtitleCue(cues, 3, 2), null);
  assert.equal(findActiveSubtitleCue(cues, 5, 2)?.text, 'Hello world');
});

test('resolveFallbackEpisodesCount preserves full counts beyond 100 episodes', () => {
  assert.equal(resolveFallbackEpisodesCount({ episodes: 220, nextEpisode: null }), 220);
  assert.equal(resolveFallbackEpisodesCount({ episodes: null, nextEpisode: 1123 }), 1122);
  assert.equal(resolveFallbackEpisodesCount({ episodes: 500, nextEpisode: 12 }), 500);
  assert.equal(resolveFallbackEpisodesCount({ episodes: null, nextEpisode: null }), 12);
});

test('fullscreen helpers resolve audio languages, comment scope keys, lock visibility, and OFF defaults', () => {
  assert.equal(DEFAULT_AMBIENT_ENABLED, false);
  assert.equal(DEFAULT_AUTO_PIP_ENABLED, false);

  assert.equal(resolveAudioLanguageOption('hi').shortLabel, 'HI');
  assert.equal(resolveAudioLanguageOption('hi').serverCategory, 'dub');
  assert.equal(resolveAudioLanguageOption('unknown').code, 'ja');

  assert.equal(getCommentsScopeKey('21', 'episode', 5), '21::ep::5');
  assert.equal(getCommentsScopeKey('21', 'series', 5), '21');

  assert.equal(
    shouldShowFullscreenControls({ isLocked: true, controlsVisible: true, hasActiveOverlay: true }),
    false,
  );
  assert.equal(
    shouldShowFullscreenControls({ isLocked: false, controlsVisible: false, hasActiveOverlay: true }),
    true,
  );

  assert.deepEqual(
    shouldHideBarsForOverlay({
      showCommentsModal: false,
      showEpisodeDrawer: false,
      showSettingsMenu: false,
      showSpeedMenu: true,
      showAudioLangMenu: false,
    }),
    { hideBottomBar: false, hideCenterCluster: true },
  );
  assert.deepEqual(
    shouldHideBarsForOverlay({
      showCommentsModal: false,
      showEpisodeDrawer: true,
      showSettingsMenu: false,
      showSpeedMenu: false,
      showAudioLangMenu: false,
    }),
    { hideBottomBar: true, hideCenterCluster: true },
  );

  assert.equal(getNextVideoFitMode('contain'), 'cover');
  assert.equal(getNextVideoFitMode('cover'), 'fill');
  assert.equal(getNextVideoFitMode('fill'), 'contain');
  assert.equal(getVideoFitBadgeLabel('contain'), 'Fit');
  assert.equal(getVideoFitBadgeLabel('cover'), 'Zoom');
  assert.equal(getVideoFitBadgeLabel('fill'), 'Fill');
  assert.ok(PLAYBACK_SPEED_OPTIONS.includes(1) && PLAYBACK_SPEED_OPTIONS.includes(2));

  assert.deepEqual(
    computeFullscreenRotationStage({
      isFullscreen: true,
      isRotated: true,
      viewportWidth: 390,
      viewportHeight: 844,
      nativeOrientationLandscape: false,
    }),
    { cssRotated: true, stageWidthPx: 844, stageHeightPx: 390 },
  );
  assert.deepEqual(
    computeFullscreenRotationStage({
      isFullscreen: true,
      isRotated: true,
      viewportWidth: 844,
      viewportHeight: 390,
      nativeOrientationLandscape: true,
    }),
    { cssRotated: false, stageWidthPx: 844, stageHeightPx: 390 },
  );
  assert.deepEqual(
    computeFullscreenRotationStage({
      isFullscreen: false,
      isRotated: false,
      viewportWidth: 390,
      viewportHeight: 844,
      nativeOrientationLandscape: false,
    }),
    { cssRotated: false },
  );
});

test('Battery Saver caps stream quality and selects <=480p HLS levels', () => {
  assert.equal(resolveEffectiveStreamQuality('1080p', false), '1080p');
  assert.equal(resolveEffectiveStreamQuality('auto', false), 'auto');
  assert.equal(resolveEffectiveStreamQuality('1080p', true), '480p');
  assert.equal(resolveEffectiveStreamQuality('720p', true), '480p');
  assert.equal(resolveEffectiveStreamQuality('auto', true), '480p');
  assert.equal(resolveEffectiveStreamQuality('360p', true), '360p');

  const levels = [
    { height: 360, bitrate: 700_000 },
    { height: 480, bitrate: 1_200_000 },
    { height: 720, bitrate: 2_600_000 },
    { height: 1080, bitrate: 5_000_000 },
  ];
  assert.equal(resolveBatterySaverHlsLevel(levels, '1080p', false), 3);
  assert.equal(resolveBatterySaverHlsLevel(levels, '1080p', true), 1);
  assert.equal(resolveBatterySaverHlsLevel(levels, 'auto', true), 1);
  assert.equal(resolveBatterySaverHlsLevel(levels, '360p', true), 0);

  const highOnlyLevels = [
    { height: 720, bitrate: 2_600_000 },
    { height: 1080, bitrate: 5_000_000 },
  ];
  assert.equal(resolveBatterySaverHlsLevel(highOnlyLevels, '1080p', true), 0);
});

test('parseSubtitleText cleans VTT blocks/ASS tags/entities and parseSubtitleSegments preserves italics', () => {
  const vtt = `WEBVTT
Kind: captions

NOTE Ignore this block

STYLE
::cue { color: yellow; }

1
00:00:05.000 --> 00:00:08.500 align:center
<i>It all began</i> &amp; more

2
00:00:06.000 --> 00:00:08.000
{\\an8}<c.yellow>HERO SIGN</c>
`;
  const cues = parseSubtitleText(vtt);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, '<i>It all began</i> & more');
  assert.equal(cues[1].text, 'HERO SIGN');
  assert.equal(stripSubtitleTags(cues[0].text), 'It all began & more');

  const segments = parseSubtitleSegments(cues[0].text);
  assert.deepEqual(segments, [
    { text: 'It all began', italic: true, bold: false, underline: false },
    { text: ' & more', italic: false, bold: false, underline: false },
  ]);

  const activeMerged = findActiveSubtitleCue(cues, 6.5, 0);
  assert.equal(activeMerged?.text, '<i>It all began</i> & more\nHERO SIGN');
});

test('resolveAvailableAudioOptions returns only source-confirmed tracks and falls back safely', () => {
  const subOnly = resolveAvailableAudioOptions(undefined);
  assert.deepEqual(subOnly.map((a) => a.code), ['ja']);

  const subAndDub = resolveAvailableAudioOptions([
    { code: 'ja', shortLabel: 'JP', label: 'Japanese (Original)', serverCategory: 'sub' },
    { code: 'en', shortLabel: 'EN', label: 'English (Dub)', serverCategory: 'dub' },
  ]);
  assert.deepEqual(subAndDub.map((a) => a.code), ['ja', 'en']);
  assert.equal(resolveAudioLanguageOption('hi', subAndDub).code, 'ja');
  assert.equal(resolveAudioLanguageOption('en', subAndDub).code, 'en');
});

test('buildSubtitleBoxCssProps applies font family, weight, edge style, and opacity', () => {
  const css = buildSubtitleBoxCssProps(
    {
      subtitleColor: '#67e8f9',
      subtitleBackground: true,
      subtitleBgOpacity: 50,
      subtitleFontFamily: 'rounded',
      subtitleFontWeight: 'extrabold',
      subtitleEdgeStyle: 'outline',
    },
    22,
  );
  assert.equal(css.fontSize, '22px');
  assert.equal(css.color, '#67e8f9');
  assert.equal(css.fontWeight, 800);
  assert.equal(css.backgroundColor, 'rgba(0, 0, 0, 0.50)');
  assert.ok(css.fontFamily.includes('ui-rounded'));
  assert.ok(css.textShadow.includes('-1px -1px 0'));
});



