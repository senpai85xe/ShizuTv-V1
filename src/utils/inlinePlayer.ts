export interface InlineSkipInterval {
  startTime: number;
  endTime: number;
  skipType: string;
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
