import { EpisodeChapterStyle } from '../data/themePresets';
import { UnifiedChapter, UnifiedEpisode } from '../types/media';

export const DEFAULT_EPISODE_CHAPTER_STYLE: EpisodeChapterStyle = 'classic';

export const EPISODE_CHAPTER_STYLE_ORDER: EpisodeChapterStyle[] = [
  'classic',
  'grid',
  'box',
  'compact',
  'cover',
];

export function resolveEpisodeChapterStyle(
  style?: string | null,
): EpisodeChapterStyle {
  if (
    style === 'classic' ||
    style === 'grid' ||
    style === 'box' ||
    style === 'compact' ||
    style === 'cover'
  ) {
    return style;
  }
  return DEFAULT_EPISODE_CHAPTER_STYLE;
}

export function getNextEpisodeChapterStyle(
  current: EpisodeChapterStyle,
): EpisodeChapterStyle {
  const idx = EPISODE_CHAPTER_STYLE_ORDER.indexOf(resolveEpisodeChapterStyle(current));
  return EPISODE_CHAPTER_STYLE_ORDER[(idx + 1) % EPISODE_CHAPTER_STYLE_ORDER.length];
}

export function getEpisodeChapterContainerClass(
  style: EpisodeChapterStyle,
  previewMode = false,
): string {
  switch (style) {
    case 'classic':
      return previewMode
        ? 'grid grid-cols-1 md:grid-cols-2 gap-2'
        : 'grid grid-cols-1 lg:grid-cols-2 gap-2.5';
    case 'grid':
      return previewMode
        ? 'grid grid-cols-2 md:grid-cols-4 gap-2.5'
        : 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3.5';
    case 'box':
      return previewMode
        ? 'grid grid-cols-4 gap-2'
        : 'grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2';
    case 'compact':
      return 'flex flex-col divide-y divide-[var(--sx-outline)]/60 rounded-[var(--sx-radius)] bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] overflow-hidden';
    case 'cover':
      return previewMode
        ? 'grid grid-cols-1 md:grid-cols-2 gap-2'
        : 'grid grid-cols-1 lg:grid-cols-2 gap-2.5';
  }
}

export function formatEpisodeDurationLabel(durationSeconds?: number): string | null {
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null;
  }
  const mins = Math.max(1, Math.round(durationSeconds / 60));
  return `${mins}m`;
}

export function formatEpisodeMetaLine(ep: UnifiedEpisode): string {
  const parts: string[] = [];
  if (ep.airDate) parts.push(ep.airDate);
  const dur = formatEpisodeDurationLabel(ep.durationSeconds);
  if (dur) parts.push(dur);
  if (parts.length === 0) parts.push('Sub & Dub');
  return parts.join(' · ');
}

export function formatChapterMetaLine(ch: UnifiedChapter): string {
  const parts: string[] = [];
  if (ch.releaseDate) parts.push(ch.releaseDate);
  if (ch.scanlator) parts.push(ch.scanlator);
  if (typeof ch.pageCount === 'number' && ch.pageCount > 0) {
    parts.push(`${ch.pageCount} pages`);
  }
  return parts.join(' · ') || 'Ready to read';
}
