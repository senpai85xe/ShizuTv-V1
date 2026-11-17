export interface InlineSkipInterval {
  startTime: number;
  endTime: number;
  skipType: string;
}

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface HlsQualityOption {
  index: number;
  label: string;
  height?: number;
  bitrate?: number;
}

export function clampEpisodeIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(total - 1, Math.floor(index)));
}

export function getEpisodeNavigationState(index: number, total: number): {
  hasPrev: boolean;
  hasNext: boolean;
  prevIndex: number;
  nextIndex: number;
} {
  const safeIndex = clampEpisodeIndex(index, total);
  const hasPrev = total > 0 && safeIndex > 0;
  const hasNext = total > 0 && safeIndex < total - 1;
  return {
    hasPrev,
    hasNext,
    prevIndex: hasPrev ? safeIndex - 1 : safeIndex,
    nextIndex: hasNext ? safeIndex + 1 : safeIndex,
  };
}

export function formatScrubberPercent(currentTime: number, duration: number): number {
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  const pct = (currentTime / duration) * 100;
  return Math.max(0, Math.min(100, pct));
}

export function getEffectiveDurationSeconds(
  videoDuration: number,
  episodeDurationSeconds?: number | null,
  mediaDurationMinutes?: number | null,
): number {
  if (Number.isFinite(videoDuration) && videoDuration > 0) {
    return videoDuration;
  }
  if (typeof episodeDurationSeconds === 'number' && Number.isFinite(episodeDurationSeconds) && episodeDurationSeconds > 0) {
    return episodeDurationSeconds;
  }
  if (typeof mediaDurationMinutes === 'number' && Number.isFinite(mediaDurationMinutes) && mediaDurationMinutes > 0) {
    return mediaDurationMinutes * 60;
  }
  return 24 * 60;
}

export function computeAutoSkipTarget(
  currentTime: number,
  intervals: InlineSkipInterval[],
  autoSkipEnabled: boolean,
): number | null {
  if (!autoSkipEnabled || !Array.isArray(intervals) || intervals.length === 0) {
    return null;
  }
  const active = intervals.find(
    (s) =>
      (s.skipType === 'op' || s.skipType === 'ed') &&
      currentTime >= s.startTime &&
      currentTime < s.endTime - 0.5,
  );
  return active ? active.endTime : null;
}

/**
 * Determines whether playback should auto-start when loading a stream.
 * Respects persisted autoPlay preference unless an explicit user click triggered playback.
 */
export function shouldAutoStartPlayback(
  autoPlayPref: boolean,
  isExplicitPlayAction = false,
): boolean {
  if (isExplicitPlayAction) return true;
  return Boolean(autoPlayPref);
}

export function getVideoFitClass(fitMode: 'contain' | 'cover' | 'fill'): string {
  switch (fitMode) {
    case 'cover':
      return 'object-cover';
    case 'fill':
      return 'object-fill';
    case 'contain':
    default:
      return 'object-contain';
  }
}

export function formatQualityLabel(height?: number, bitrate?: number): string {
  if (typeof height === 'number' && Number.isFinite(height) && height > 0) {
    return `${Math.round(height)}p`;
  }
  if (typeof bitrate === 'number' && Number.isFinite(bitrate) && bitrate > 0) {
    return `${Math.round(bitrate / 1000)}kbps`;
  }
  return 'Source';
}

export function buildHlsQualityOptions(
  levels: Array<{ height?: number; bitrate?: number }>,
): HlsQualityOption[] {
  const options: HlsQualityOption[] = [{ index: -1, label: 'Auto' }];
  if (!Array.isArray(levels) || levels.length === 0) {
    return options;
  }
  const mapped = levels.map((lvl, index) => ({
    index,
    label: formatQualityLabel(lvl.height, lvl.bitrate),
    height: lvl.height,
    bitrate: lvl.bitrate,
  }));
  mapped.sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.bitrate ?? 0) - (a.bitrate ?? 0));

  const seenLabels = new Set<string>();
  for (const opt of mapped) {
    if (!seenLabels.has(opt.label)) {
      seenLabels.add(opt.label);
      options.push(opt);
    }
  }
  return options;
}

export function resolvePreferredHlsLevel(
  levels: Array<{ height?: number; bitrate?: number }>,
  qualityPref: string,
): number {
  if (!Array.isArray(levels) || levels.length === 0 || qualityPref === 'auto') {
    return -1;
  }
  const targetHeight = Number.parseInt(qualityPref.replace(/\D/g, ''), 10);
  if (!Number.isFinite(targetHeight) || targetHeight <= 0) {
    return -1;
  }
  let bestIdx = -1;
  let bestDiff = Number.POSITIVE_INFINITY;
  levels.forEach((lvl, idx) => {
    if (typeof lvl.height === 'number' && lvl.height > 0) {
      const diff = Math.abs(lvl.height - targetHeight);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = idx;
      }
    }
  });
  return bestIdx;
}

export function findActiveSubtitleCue(
  cues: SubtitleCue[] | undefined,
  currentTime: number,
  offsetSeconds = 0,
): SubtitleCue | null {
  if (!Array.isArray(cues) || cues.length === 0 || !Number.isFinite(currentTime)) {
    return null;
  }
  const shiftedTime = currentTime - (Number.isFinite(offsetSeconds) ? offsetSeconds : 0);
  return cues.find((c) => shiftedTime >= c.start && shiftedTime <= c.end) ?? null;
}

function parseTimestampToSeconds(raw: string): number {
  const clean = raw.trim().replace(',', '.');
  const parts = clean.split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] || 0;
}

export function parseSubtitleText(raw: string): SubtitleCue[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const blocks = trimmed.replace(/\r\n/g, '\n').split(/\n\s*\n/);
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    if (lines[0].toUpperCase().startsWith('WEBVTT')) continue;

    const timingLineIdx = lines.findIndex((l) => l.includes('-->'));
    if (timingLineIdx >= 0) {
      const [startStr, endStrRaw] = lines[timingLineIdx].split('-->');
      const endStr = (endStrRaw || '').trim().split(/\s+/)[0];
      const start = parseTimestampToSeconds(startStr);
      const end = Math.max(start + 0.5, parseTimestampToSeconds(endStr));
      const text = lines.slice(timingLineIdx + 1).join('\n').trim();
      if (text) {
        cues.push({ start, end, text });
      }
    }
  }

  if (cues.length > 0) return cues;

  // Fallback: treat each non-empty line as a sequential 4-second subtitle cue
  const fallbackLines = trimmed
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return fallbackLines.map((text, idx) => ({
    start: idx * 4,
    end: idx * 4 + 3.8,
    text,
  }));
}

export const DEFAULT_AMBIENT_ENABLED = false;
export const DEFAULT_AUTO_PIP_ENABLED = false;

export type AudioLanguageCode = 'ja' | 'en' | 'hi' | 'es';

export interface AudioLanguageOption {
  code: AudioLanguageCode;
  shortLabel: string;
  label: string;
  serverCategory: 'sub' | 'dub';
}

export const AUDIO_LANGUAGE_OPTIONS: AudioLanguageOption[] = [
  { code: 'ja', shortLabel: 'JP', label: 'Japanese (Original)', serverCategory: 'sub' },
  { code: 'en', shortLabel: 'EN', label: 'English (Dub)', serverCategory: 'dub' },
  { code: 'hi', shortLabel: 'HI', label: 'Hindi (Dub)', serverCategory: 'dub' },
  { code: 'es', shortLabel: 'ES', label: 'Spanish (Dub)', serverCategory: 'dub' },
];

export function resolveAudioLanguageOption(
  code?: string | null,
): AudioLanguageOption {
  return (
    AUDIO_LANGUAGE_OPTIONS.find((opt) => opt.code === code) ?? AUDIO_LANGUAGE_OPTIONS[0]
  );
}

export type FullscreenCommentScope = 'episode' | 'series';

export function getCommentsScopeKey(
  mediaId: string,
  scope: FullscreenCommentScope,
  episodeNumber: number,
): string {
  if (scope === 'episode') {
    const safeEp =
      Number.isFinite(episodeNumber) && episodeNumber > 0
        ? Math.floor(episodeNumber)
        : 1;
    return `${mediaId}::ep::${safeEp}`;
  }
  return mediaId;
}

export function shouldShowFullscreenControls(input: {
  isLocked: boolean;
  controlsVisible: boolean;
  hasActiveOverlay: boolean;
}): boolean {
  if (input.isLocked) return false;
  return Boolean(input.controlsVisible || input.hasActiveOverlay);
}

export function shouldHideBarsForOverlay(input: {
  showCommentsModal: boolean;
  showEpisodeDrawer: boolean;
  showSettingsMenu: boolean;
  showSpeedMenu: boolean;
  showAudioLangMenu: boolean;
}): {
  hideBottomBar: boolean;
  hideCenterCluster: boolean;
} {
  const hasFullDrawerOrModal = Boolean(input.showCommentsModal || input.showEpisodeDrawer);
  const hasAnyPopover = Boolean(
    hasFullDrawerOrModal ||
      input.showSettingsMenu ||
      input.showSpeedMenu ||
      input.showAudioLangMenu,
  );
  return {
    hideBottomBar: hasFullDrawerOrModal,
    hideCenterCluster: hasAnyPopover,
  };
}

export const PLAYBACK_SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export function getNextVideoFitMode(
  current: 'contain' | 'cover' | 'fill',
): 'contain' | 'cover' | 'fill' {
  if (current === 'contain') return 'cover';
  if (current === 'cover') return 'fill';
  return 'contain';
}

export function getVideoFitBadgeLabel(fitMode: 'contain' | 'cover' | 'fill'): string {
  switch (fitMode) {
    case 'cover':
      return 'Zoom';
    case 'fill':
      return 'Fill';
    case 'contain':
    default:
      return 'Fit';
  }
}

export function computeFullscreenRotationStage(input: {
  isFullscreen: boolean;
  isRotated: boolean;
  viewportWidth: number;
  viewportHeight: number;
  nativeOrientationLandscape: boolean;
}): {
  cssRotated: boolean;
  stageWidthPx?: number;
  stageHeightPx?: number;
} {
  if (!input.isFullscreen) {
    return { cssRotated: false };
  }
  const safeW = Number.isFinite(input.viewportWidth) && input.viewportWidth > 0 ? input.viewportWidth : 390;
  const safeH = Number.isFinite(input.viewportHeight) && input.viewportHeight > 0 ? input.viewportHeight : 844;
  if (!input.isRotated || input.nativeOrientationLandscape) {
    return { cssRotated: false, stageWidthPx: safeW, stageHeightPx: safeH };
  }
  return {
    cssRotated: true,
    stageWidthPx: safeH,
    stageHeightPx: safeW,
  };
}
