import { clampSeekTarget, formatPlayerTime } from './detailsLayout';

export type PlayerGestureKind = 'none' | 'seek' | 'volume' | 'brightness';

/**
 * Classifies pointer movement once it crosses the deadzone threshold:
 * - Horizontal movement locks to timeline seeking ('seek')
 * - Vertical movement locks to 'volume' (right/center >= 45% width) or 'brightness' (left < 45%)
 */
export function detectPlayerGestureKind(
  dx: number,
  dy: number,
  startX: number,
  containerWidth: number,
  thresholdPx = 14,
): PlayerGestureKind {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < thresholdPx && absY < thresholdPx) {
    return 'none';
  }
  if (absX >= absY) {
    return 'seek';
  }
  const safeWidth = containerWidth > 0 ? containerWidth : 1;
  return startX < safeWidth * 0.45 ? 'brightness' : 'volume';
}

/**
 * Computes clamped seek target and signed delta from horizontal drag distance.
 */
export function computeSwipeSeekTarget(
  startTime: number,
  dx: number,
  containerWidth: number,
  duration: number,
  maxSpanSeconds = 90,
): { targetTime: number; deltaSeconds: number } {
  const safeStart = Number.isFinite(startTime) && startTime >= 0 ? startTime : 0;
  const safeWidth = containerWidth > 200 ? containerWidth : 320;
  const rawDelta = Math.round((dx / safeWidth) * maxSpanSeconds);
  const effectiveDuration = Number.isFinite(duration) && duration > 0 ? duration : 1440;
  const targetTime = clampSeekTarget(safeStart, rawDelta, effectiveDuration);
  return {
    targetTime,
    deltaSeconds: Math.round(targetTime - safeStart),
  };
}

/**
 * Maps vertical drag (dy < 0 = swipe up = increase) to a normalized [minLevel, maxLevel] value.
 */
export function computeSwipeVerticalLevel(
  startLevel: number,
  dy: number,
  sensitivityPx = 220,
  minLevel = 0,
  maxLevel = 1,
): number {
  const safeStart = Number.isFinite(startLevel) ? startLevel : maxLevel;
  const safeSensitivity = sensitivityPx > 0 ? sensitivityPx : 220;
  const next = safeStart + (-dy / safeSensitivity) * (maxLevel - minLevel);
  const clamped = Math.max(minLevel, Math.min(maxLevel, next));
  return Math.round(clamped * 100) / 100;
}

/**
 * Formats signed delta seconds cleanly (e.g. "+00:18", "-00:09").
 */
export function formatSignedSeekDelta(deltaSeconds: number): string {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds === 0) return '+00:00';
  const sign = deltaSeconds > 0 ? '+' : '-';
  return `${sign}${formatPlayerTime(Math.abs(deltaSeconds))}`;
}
