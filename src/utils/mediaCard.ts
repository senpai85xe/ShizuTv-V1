import { HistoryEntry, LibraryEntry, UnifiedMedia } from '../types/media';
import { MediaCardStyle } from '../data/themePresets';

export function formatCardFormatTag(media: UnifiedMedia): string {
  return (media.format || media.type || 'ANIME').toUpperCase();
}

export function formatCardUnitLabel(media: UnifiedMedia): string | null {
  const isReading = media.type === 'MANGA' || media.type === 'NOVEL';
  if (isReading) {
    if (typeof media.chapters === 'number' && media.chapters > 0) {
      return `CH ${String(media.chapters).padStart(2, '0')}`;
    }
    return null;
  }

  // Prefer latest aired episode if nextEpisode is known (> 1), else total episodes
  const airedCount =
    typeof media.nextEpisode === 'number' && media.nextEpisode > 1
      ? media.nextEpisode - 1
      : media.episodes;

  if (typeof airedCount === 'number' && airedCount > 0) {
    return `EP ${String(airedCount).padStart(2, '0')}`;
  }
  return null;
}

export function formatContinueStepLabel(isManga: boolean, number?: number): string {
  const n = typeof number === 'number' && number > 0 ? number : 1;
  return isManga ? `Chapter ${n}` : `Episode ${n}`;
}

export function formatRemainingLabel(params: {
  isManga: boolean;
  positionSeconds?: number;
  durationSeconds?: number;
  pageIndex?: number;
  totalPages?: number;
  defaultDurationMinutes?: number;
}): string | null {
  if (params.isManga) {
    if (typeof params.totalPages === 'number' && params.totalPages > 0) {
      const currentPage = (params.pageIndex ?? 0) + 1;
      const pagesLeft = Math.max(0, params.totalPages - currentPage);
      return pagesLeft === 0 ? 'Done' : `${pagesLeft}p left`;
    }
    return null;
  }

  const totalSec =
    typeof params.durationSeconds === 'number' && params.durationSeconds > 0
      ? params.durationSeconds
      : (params.defaultDurationMinutes && params.defaultDurationMinutes > 0
          ? params.defaultDurationMinutes
          : 24) * 60;
  const posSec = Math.max(0, params.positionSeconds ?? 0);
  const remainingSec = Math.max(0, totalSec - posSec);
  const minsLeft = Math.max(1, Math.ceil(remainingSec / 60));
  return remainingSec === 0 ? 'Finished' : `${minsLeft}m left`;
}

export function formatTrendingGenreLabel(media: UnifiedMedia): string | null {
  const firstGenre = media.genres?.find((g) => g.trim().length > 0);
  if (firstGenre) return firstGenre.trim();
  return media.format || media.type || null;
}

export function getContinueWatchingWidthClass(fullWidth = false): string {
  return fullWidth ? 'w-full' : 'shrink-0 w-[174px] sm:w-[244px]';
}

export function mergeContinueHistoryItems(
  localHistory: HistoryEntry[],
  cloudEntries: LibraryEntry[],
  isManga: boolean,
): HistoryEntry[] {
  const localFiltered = localHistory.filter((h) =>
    isManga
      ? h.mediaType === 'MANGA' || h.mediaType === 'NOVEL'
      : h.mediaType === 'ANIME' || h.mediaType === 'TV' || h.mediaType === 'MOVIE',
  );
  const seenMediaIds = new Set(localFiltered.map((h) => h.mediaId));
  const cloudMapped: HistoryEntry[] = cloudEntries
    .filter((entry) => !seenMediaIds.has(entry.mediaId))
    .map((entry) => {
      const nextStep = Math.max(1, entry.progress > 0 ? entry.progress + 1 : 1);
      return {
        id: `cloud-${entry.mediaId}-${nextStep}`,
        mediaId: entry.mediaId,
        mediaType: entry.mediaType,
        media: entry.media,
        ...(isManga ? { chapterNumber: nextStep } : { episodeNumber: nextStep }),
        updatedAt: entry.updatedAt,
      };
    });

  return [...localFiltered, ...cloudMapped];
}

export function getMediaGridClassName(cardStyle: MediaCardStyle): string {
  if (cardStyle === 'cinematic' || cardStyle === 'wideBanner') {
    return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5';
  }
  if (cardStyle === 'episodeTile' || cardStyle === 'trendingRank') {
    return 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-5';
  }
  if (cardStyle === 'compact') {
    return 'grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 sm:gap-4';
  }
  return 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-5';
}

export const DEFAULT_MEDIA_CARD_STYLE: MediaCardStyle = 'expressive';
export const DEFAULT_CONTINUE_CARD_STYLE: MediaCardStyle = 'episodeTile';

export interface CardStylePrefs {
  cardStyle: MediaCardStyle;
  continueWatchingStyle: MediaCardStyle;
  continueReadingStyle: MediaCardStyle;
}

export function createDefaultCardStylePrefs(): CardStylePrefs {
  return {
    cardStyle: DEFAULT_MEDIA_CARD_STYLE,
    continueWatchingStyle: DEFAULT_CONTINUE_CARD_STYLE,
    continueReadingStyle: DEFAULT_CONTINUE_CARD_STYLE,
  };
}

export function selectMediaCardStyle<T extends CardStylePrefs>(
  prefs: T,
  cardStyle: MediaCardStyle,
): T {
  return {
    ...prefs,
    cardStyle,
  };
}
