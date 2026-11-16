import React from 'react';
import { MediaCardStyle } from '../data/themePresets';
import { useApp } from '../store/AppContext';
import { getContinueWatchingWidthClass } from '../utils/mediaCard';

interface MediaCardSkeletonProps {
  style?: MediaCardStyle;
  fullWidth?: boolean;
}

interface ContinueWatchingCardSkeletonProps {
  fullWidth?: boolean;
  showRemove?: boolean;
  showProgress?: boolean;
}

export const TrendingRankCardSkeleton: React.FC<{ fullWidth?: boolean }> = ({
  fullWidth = false,
}) => {
  const { state } = useApp();
  const roundness = `${state.themePrefs.uiRoundness}px`;

  return (
    <div
      data-testid="trending-rank-skeleton"
      aria-hidden="true"
      style={{ borderRadius: `calc(${roundness} + 8px)` }}
      className={`relative overflow-hidden bg-[var(--sx-surface-container)] border border-[var(--sx-outline)]/60 aspect-[4/3] animate-pulse ${
        fullWidth ? 'w-full' : 'shrink-0 w-[232px] sm:w-[285px]'
      }`}
    >
      <div className="absolute inset-0 bg-[var(--sx-surface-high)]/75" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 px-3.5 pb-3 pt-4 sm:px-4 sm:pb-3.5 flex items-center gap-2.5 sm:gap-3">
        <div className="w-6 h-8 sm:w-7 sm:h-9 rounded-md bg-white/15 shrink-0" />
        <div className="w-[1.5px] h-8 sm:h-9 bg-white/20 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3.5 sm:h-4 w-3/4 rounded bg-white/20" />
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-8 rounded bg-white/15" />
            <div className="h-2.5 w-14 rounded bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
};

export const ContinueWatchingCardSkeleton: React.FC<ContinueWatchingCardSkeletonProps> = ({
  fullWidth = false,
  showRemove = true,
  showProgress = true,
}) => {
  const { state } = useApp();
  const roundness = `${state.themePrefs.uiRoundness}px`;

  return (
    <div
      data-testid="episode-tile-skeleton"
      data-skeleton-variant="continue-watching"
      aria-hidden="true"
      className={`relative flex flex-col animate-pulse ${getContinueWatchingWidthClass(fullWidth)}`}
    >
      <div
        style={{ borderRadius: roundness }}
        className="relative w-full aspect-[16/10] overflow-hidden bg-[var(--sx-surface-high)] border border-[var(--sx-outline)]/60"
      >
        {showRemove && (
          <div className="absolute top-2 right-2 sm:top-2.5 sm:right-2.5 w-7 h-7 rounded-full bg-white/10 border border-white/10" />
        )}
        {showProgress && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
            <div className="h-full w-1/2 bg-[var(--sx-primary)]/45" />
          </div>
        )}
      </div>

      <div className="mt-2 sm:mt-2.5 px-0.5 space-y-1">
        <div className="flex items-center justify-between gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <div className="h-[19px] w-7 rounded bg-[var(--sx-primary)]/20 shrink-0" />
            <div className="h-4 w-14 sm:w-16 rounded bg-[var(--sx-surface-high)]" />
          </div>
          <div className="h-4 w-10 sm:w-12 rounded bg-[var(--sx-surface-high)] shrink-0" />
        </div>
        <div className="h-[18px] sm:h-[19px] w-4/5 rounded bg-[var(--sx-surface-high)]" />
      </div>
    </div>
  );
};

export const EpisodeTileCardSkeleton = ContinueWatchingCardSkeleton;

export const ContinueHistoryCardSkeleton: React.FC = () => {
  return (
    <div
      data-testid="continue-history-card-skeleton"
      aria-hidden="true"
      className="flex items-center gap-3.5 p-3 rounded-[var(--sx-radius)] bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] animate-pulse"
    >
      <div className="w-16 h-24 rounded-xl bg-[var(--sx-surface-high)] shrink-0" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="h-4 w-4/5 rounded bg-[var(--sx-surface-high)]" />
        <div className="h-3.5 w-24 rounded bg-[var(--sx-primary)]/25" />
        <div className="flex items-center gap-2 pt-1">
          <div className="h-7 w-20 rounded-lg bg-[var(--sx-primary)]/25" />
          <div className="w-7 h-7 rounded-lg bg-[var(--sx-surface-high)]" />
        </div>
      </div>
    </div>
  );
};

export const MediaCardSkeleton: React.FC<MediaCardSkeletonProps> = ({
  style: styleOverride,
  fullWidth = false,
}) => {
  const { state } = useApp();
  const cardStyle = styleOverride ?? state.uiPrefs.cardStyle;
  const roundness = `${state.themePrefs.uiRoundness}px`;

  if (cardStyle === 'trendingRank') {
    return <TrendingRankCardSkeleton fullWidth={fullWidth} />;
  }

  if (cardStyle === 'episodeTile') {
    return <ContinueWatchingCardSkeleton fullWidth={fullWidth} />;
  }

  if (cardStyle === 'cinematic' || cardStyle === 'wideBanner') {
    const isBanner = cardStyle === 'wideBanner';
    return (
      <div
        aria-hidden="true"
        style={{ borderRadius: roundness }}
        className={`bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] p-3 flex items-center gap-3.5 animate-pulse ${
          fullWidth
            ? isBanner
              ? 'w-full h-[132px]'
              : 'w-full h-[120px]'
            : isBanner
              ? 'shrink-0 w-[340px] sm:w-[390px] h-[132px]'
              : 'shrink-0 w-[300px] sm:w-[340px] h-[120px]'
        }`}
      >
        <div className="h-full aspect-[2/3] rounded-lg bg-[var(--sx-surface-high)] shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-4/5 rounded bg-[var(--sx-surface-high)]" />
          <div className="h-3 w-1/2 rounded bg-[var(--sx-surface-high)]" />
        </div>
      </div>
    );
  }

  const widthClass = fullWidth
    ? 'w-full'
    : cardStyle === 'showcase' || cardStyle === 'shizutv'
      ? 'shrink-0 w-[158px] sm:w-[174px]'
      : cardStyle === 'compact'
        ? 'shrink-0 w-[122px] sm:w-[132px]'
        : cardStyle === 'minimal'
          ? 'shrink-0 w-[134px] sm:w-[144px]'
          : 'shrink-0 w-[148px] sm:w-[162px]';

  return (
    <div
      data-testid="poster-card-skeleton"
      aria-hidden="true"
      className={`space-y-2 animate-pulse ${widthClass}`}
    >
      <div
        style={{ borderRadius: roundness }}
        className="w-full aspect-[2/3] bg-[var(--sx-surface-high)] border border-[var(--sx-outline)]/40"
      />
      <div className="h-3.5 w-4/5 rounded bg-[var(--sx-surface-high)]" />
      <div className="h-2.5 w-1/2 rounded bg-[var(--sx-surface-high)]" />
    </div>
  );
};
