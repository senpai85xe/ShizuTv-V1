import React from 'react';
import { Calendar, Heart, Star, X } from 'lucide-react';
import { getPreferredTitle, UnifiedMedia } from '../types/media';
import { MediaCardStyle } from '../data/themePresets';
import { useApp } from '../store/AppContext';
import { SmartImage } from './SmartImage';
import {
  formatCardFormatTag,
  formatCardUnitLabel,
  formatTrendingGenreLabel,
  getContinueWatchingWidthClass,
} from '../utils/mediaCard';
import { getStaggerDelayMs } from '../utils/cardMotion';

interface MediaCardProps {
  media: UnifiedMedia;
  style?: MediaCardStyle;
  onClick: () => void;
  progressLabel?: string;
  progressPercent?: number;
  subtitleRight?: string | null;
  onRemove?: () => void;
  fullWidth?: boolean;
  rank?: number;
  animationIndex?: number;
}

export const MediaCard: React.FC<MediaCardProps> = ({
  media,
  style: styleOverride,
  onClick,
  progressLabel,
  progressPercent,
  subtitleRight,
  onRemove,
  fullWidth = false,
  rank,
  animationIndex,
}) => {
  const { state, getLibraryEntry, upsertLibraryEntry, removeLibraryEntry } = useApp();
  const cardStyle = styleOverride ?? state.uiPrefs.cardStyle;
  const title = getPreferredTitle(media.title, state.contentPrefs.titlePreference);
  const scoreStr = media.score ? media.score.toFixed(1) : null;
  const roundness = `${state.themePrefs.uiRoundness}px`;

  const entranceStyle: React.CSSProperties | undefined =
    typeof animationIndex === 'number'
      ? { animationDelay: `${getStaggerDelayMs(animationIndex)}ms` }
      : undefined;
  const entranceClass = typeof animationIndex === 'number' ? 'sx-card-animate' : '';

  if (cardStyle === 'trendingRank') {
    const rankNum = typeof rank === 'number' && rank > 0 ? rank : 1;
    const genreLabel = formatTrendingGenreLabel(media);

    return (
      <button
        type="button"
        data-testid={`media-card-trending-rank-${media.id}`}
        onClick={onClick}
        style={{ borderRadius: `calc(${roundness} + 8px)`, ...entranceStyle }}
        className={`group relative overflow-hidden text-left sx-glass-panel border border-[var(--sx-outline)]/70 aspect-[4/3] sx-card-spring ${entranceClass} hover:border-[var(--sx-primary)]/50 hover:shadow-[0_16px_32px_-14px_rgba(0,0,0,0.5)] focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)] ${
          fullWidth ? 'w-full' : 'shrink-0 w-[232px] sm:w-[285px]'
        }`}
      >
        <div className="absolute inset-0 z-0">
          <SmartImage
            src={media.banner || media.cover}
            alt={title}
            fallbackTitle={title}
            className="w-full h-full group-hover:scale-[1.06] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          />
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-3/4 bg-gradient-to-t from-black/95 via-black/45 to-transparent" />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3.5 pb-3 pt-4 sm:px-4 sm:pb-3.5 flex items-center gap-2.5 sm:gap-3">
          <span
            data-testid="trending-rank-number"
            className="text-[36px] sm:text-[42px] font-extrabold text-white leading-[0.86] tabular-nums tracking-tight drop-shadow shrink-0 transition-transform duration-300 group-hover:scale-105"
          >
            {rankNum}
          </span>

          <span
            aria-hidden="true"
            className="w-[1.5px] h-8 sm:h-9 bg-white/35 shrink-0"
          />

          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] sm:text-[16px] font-bold text-white line-clamp-1 leading-tight drop-shadow group-hover:text-[var(--sx-primary)] transition-colors">
              {title}
            </h3>
            {(scoreStr || genreLabel) && (
              <div className="mt-1 flex items-center gap-1.5 text-[11px] sm:text-xs tabular-nums truncate">
                {scoreStr && (
                  <span className="inline-flex items-center gap-1 text-white/95 font-semibold shrink-0">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <span>{scoreStr}</span>
                  </span>
                )}
                {scoreStr && genreLabel && (
                  <span aria-hidden="true" className="text-white/55">
                    •
                  </span>
                )}
                {genreLabel && (
                  <span className="text-white/75 font-medium truncate">{genreLabel}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </button>
    );
  }

  if (cardStyle === 'episodeTile') {
    const formatTag = formatCardFormatTag(media);
    const stepText = progressLabel ?? formatCardUnitLabel(media) ?? 'Episode 1';
    const rightText =
      subtitleRight !== undefined
        ? subtitleRight
        : media.duration
          ? `${media.duration}m`
          : null;

    return (
      <div
        data-testid={`media-card-episode-tile-${media.id}`}
        style={entranceStyle}
        className={`group relative flex flex-col sx-card-spring ${entranceClass} ${getContinueWatchingWidthClass(
          fullWidth,
        )}`}
      >
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label={`Remove ${title} from continue list`}
            className="absolute top-2 right-2 sm:top-2.5 sm:right-2.5 z-20 w-7 h-7 rounded-full bg-black/60 hover:bg-red-500 backdrop-blur-md border border-white/15 flex items-center justify-center text-white transition-all duration-150 active:scale-90 focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={onClick}
          style={{ borderRadius: roundness }}
          className="w-full text-left flex flex-col focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
        >
          <div
            style={{ borderRadius: roundness }}
            className="relative w-full aspect-[16/10] overflow-hidden bg-[var(--sx-surface-high)] border border-[var(--sx-outline)]/70 group-hover:border-[var(--sx-primary)]/45 group-hover:shadow-[0_14px_28px_-12px_rgba(0,0,0,0.45)] transition-all duration-200"
          >
            <SmartImage
              src={media.banner || media.cover}
              alt={title}
              fallbackTitle={title}
              className="w-full h-full group-hover:scale-[1.06] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            />
            {typeof progressPercent === 'number' && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                <div
                  className="h-full bg-[var(--sx-primary)] transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(4, progressPercent * 100))}%` }}
                />
              </div>
            )}
          </div>

          <div className="mt-2 sm:mt-2.5 px-0.5 space-y-1">
            <div className="flex items-center justify-between gap-1.5 sm:gap-2 text-[11px] sm:text-xs">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <span className="text-[var(--sx-primary)] text-[10px] font-extrabold uppercase tracking-wide shrink-0">
                  {formatTag}
                </span>
                <span aria-hidden="true" className="text-[var(--sx-on-surface-muted)]/50">
                  ·
                </span>
                <span className="text-[var(--sx-on-surface-muted)] font-semibold truncate tabular-nums">
                  {stepText}
                </span>
              </div>
              {rightText && (
                <span className="text-[11px] font-medium text-[var(--sx-on-surface-muted)] tabular-nums shrink-0">
                  {rightText}
                </span>
              )}
            </div>
            <h3 className="text-[13px] sm:text-sm font-bold text-[var(--sx-on-surface)] line-clamp-1 leading-snug group-hover:text-[var(--sx-primary)] transition-colors">
              {title}
            </h3>
          </div>
        </button>
      </div>
    );
  }

  if (cardStyle === 'showcase') {
    const inLibrary = Boolean(getLibraryEntry(media.id));
    const formatTag = formatCardFormatTag(media);
    const unitText = progressLabel ?? formatCardUnitLabel(media);

    const handleToggleLibrary = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (inLibrary) {
        removeLibraryEntry(media.id);
      } else {
        void upsertLibraryEntry(media, 'PLANNING', 0);
      }
    };

    return (
      <div
        data-testid={`media-card-showcase-${media.id}`}
        style={entranceStyle}
        className={`group relative flex flex-col sx-card-spring ${entranceClass} ${
          fullWidth ? 'w-full' : 'shrink-0 w-[158px] sm:w-[174px]'
        }`}
      >
        <button
          type="button"
          onClick={handleToggleLibrary}
          aria-pressed={inLibrary}
          aria-label={inLibrary ? `Remove ${title} from library` : `Add ${title} to library`}
          className="absolute top-2.5 right-2.5 z-20 w-8 h-8 rounded-full bg-black/50 hover:bg-black/75 backdrop-blur-md border border-white/15 flex items-center justify-center transition-all duration-150 active:scale-90 focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
        >
          <Heart
            className={`w-4 h-4 transition-colors ${
              inLibrary ? 'text-[var(--sx-primary)] fill-[var(--sx-primary)]' : 'text-white'
            }`}
          />
        </button>

        <button
          type="button"
          onClick={onClick}
          style={{ borderRadius: roundness }}
          className="w-full text-left flex flex-col focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
        >
          <div
            style={{ borderRadius: roundness }}
            className="relative w-full aspect-[2/3] overflow-hidden bg-[var(--sx-surface-high)] border border-[var(--sx-outline)]/70 group-hover:border-[var(--sx-primary)]/45 group-hover:shadow-[0_14px_28px_-12px_rgba(0,0,0,0.45)] transition-all duration-200"
          >
            <SmartImage
              src={media.cover}
              alt={title}
              fallbackTitle={title}
              className="w-full h-full group-hover:scale-[1.06] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            />

            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

            <div className="pointer-events-none absolute bottom-2.5 inset-x-2.5 flex items-center justify-between gap-1.5 text-white text-[10px] font-bold tracking-wide">
              <span className="truncate drop-shadow">{formatTag}</span>
              {media.year && (
                <span className="inline-flex items-center gap-1 tabular-nums shrink-0 drop-shadow">
                  <Calendar className="w-3 h-3 text-white/80" />
                  <span>{media.year}</span>
                </span>
              )}
            </div>

            {typeof progressPercent === 'number' && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                <div
                  className="h-full bg-[var(--sx-primary)] transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(4, progressPercent * 100))}%` }}
                />
              </div>
            )}
          </div>

          <div className="mt-2.5 px-0.5 space-y-1">
            <h3 className="text-[13px] sm:text-sm font-bold text-[var(--sx-on-surface)] line-clamp-2 leading-snug group-hover:text-[var(--sx-primary)] transition-colors">
              {title}
            </h3>
            {(scoreStr || unitText) && (
              <div className="flex items-center gap-2 text-[11px] sm:text-xs font-semibold text-[var(--sx-on-surface-muted)] tabular-nums truncate">
                {scoreStr && (
                  <span className="inline-flex items-center gap-1 text-[var(--sx-on-surface)] font-bold">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span>{scoreStr}</span>
                  </span>
                )}
                {scoreStr && unitText && (
                  <span aria-hidden="true" className="text-[var(--sx-outline)]">
                    ·
                  </span>
                )}
                {unitText && <span>{unitText}</span>}
              </div>
            )}
          </div>
        </button>
      </div>
    );
  }

  if (cardStyle === 'shizutv') {
    const inLibrary = Boolean(getLibraryEntry(media.id));
    const formatTag = formatCardFormatTag(media);
    const unitText = progressLabel ?? formatCardUnitLabel(media);

    const handleToggleLibrary = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (inLibrary) {
        removeLibraryEntry(media.id);
      } else {
        void upsertLibraryEntry(media, 'PLANNING', 0);
      }
    };

    return (
      <div
        data-testid={`media-card-shizutv-${media.id}`}
        style={entranceStyle}
        className={`group relative flex flex-col sx-card-spring ${entranceClass} ${
          fullWidth ? 'w-full' : 'shrink-0 w-[158px] sm:w-[174px]'
        }`}
      >
        <button
          type="button"
          onClick={handleToggleLibrary}
          aria-pressed={inLibrary}
          aria-label={inLibrary ? `Remove ${title} from library` : `Add ${title} to library`}
          className="absolute top-2.5 right-2.5 z-20 w-8 h-8 rounded-full bg-black/55 hover:bg-black/75 backdrop-blur-md border border-white/15 flex items-center justify-center transition-all duration-150 active:scale-90 focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)] shadow-md"
        >
          <Heart
            className={`w-4 h-4 transition-colors ${
              inLibrary ? 'text-[var(--sx-primary)] fill-[var(--sx-primary)]' : 'text-white'
            }`}
          />
        </button>

        <button
          type="button"
          onClick={onClick}
          style={{ borderRadius: `calc(${roundness} + 2px)` }}
          className="w-full text-left flex flex-col focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
        >
          <div
            style={{ borderRadius: `calc(${roundness} + 2px)` }}
            className="relative w-full aspect-[2/3] overflow-hidden bg-[var(--sx-surface-high)] border border-white/10 group-hover:border-[var(--sx-primary)]/50 group-hover:shadow-[0_14px_28px_-12px_rgba(0,0,0,0.5)] transition-all duration-200"
          >
            <SmartImage
              src={media.cover}
              alt={title}
              fallbackTitle={title}
              className="w-full h-full group-hover:scale-[1.06] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            />

            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />

            <div className="pointer-events-none absolute bottom-2.5 inset-x-2.5 flex items-center justify-between gap-1.5">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/15 text-white text-[10px] sm:text-[11px] font-bold tracking-wide truncate shadow-sm">
                {formatTag}
              </span>
              {media.year && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/15 text-white text-[10px] sm:text-[11px] font-bold tabular-nums shrink-0 shadow-sm">
                  <Calendar className="w-3 h-3 text-white/85" />
                  <span>{media.year}</span>
                </span>
              )}
            </div>

            {typeof progressPercent === 'number' && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                <div
                  className="h-full bg-[var(--sx-primary)] transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(4, progressPercent * 100))}%` }}
                />
              </div>
            )}
          </div>

          <div className="mt-2.5 px-0.5 space-y-1">
            <h3 className="text-[13px] sm:text-sm font-bold text-[var(--sx-on-surface)] line-clamp-2 leading-snug group-hover:text-[var(--sx-primary)] transition-colors">
              {title}
            </h3>
            {(scoreStr || unitText) && (
              <div className="flex items-center gap-2 text-[11px] sm:text-xs tabular-nums truncate">
                {scoreStr && (
                  <span className="inline-flex items-center gap-1 text-[var(--sx-on-surface)] font-bold shrink-0">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span>{scoreStr}</span>
                  </span>
                )}
                {scoreStr && unitText && (
                  <span
                    aria-hidden="true"
                    className="w-[1px] h-3 bg-[var(--sx-on-surface-muted)]/35 shrink-0"
                  />
                )}
                {unitText && (
                  <span className="font-semibold text-[var(--sx-on-surface-muted)] uppercase tracking-wide truncate">
                    {unitText}
                  </span>
                )}
              </div>
            )}
          </div>
        </button>
      </div>
    );
  }

  if (cardStyle === 'cinematic' || cardStyle === 'wideBanner') {
    const isBanner = cardStyle === 'wideBanner';
    return (
      <button
        type="button"
        onClick={onClick}
        style={{ borderRadius: roundness, ...entranceStyle }}
        className={`group relative overflow-hidden text-left sx-glass-panel border border-[var(--sx-outline)] sx-card-spring ${entranceClass} hover:border-[var(--sx-primary)]/50 hover:shadow-[0_14px_28px_-12px_rgba(0,0,0,0.45)] focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)] ${
          fullWidth
            ? isBanner
              ? 'w-full h-[132px]'
              : 'w-full h-[120px]'
            : isBanner
              ? 'shrink-0 w-[340px] sm:w-[390px] h-[132px]'
              : 'shrink-0 w-[300px] sm:w-[340px] h-[120px]'
        }`}
      >
        <SmartImage
          src={media.banner || media.cover}
          alt={title}
          fallbackTitle={title}
          className="absolute inset-0 w-full h-full opacity-55 group-hover:scale-[1.06] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/65 to-black/25" />
        <div className="relative z-10 h-full flex items-center gap-3.5 p-3">
          <SmartImage
            src={media.cover}
            alt={title}
            fallbackTitle={title}
            className="h-full aspect-[2/3] shrink-0 rounded-lg shadow-md transition-transform duration-300 group-hover:scale-[1.03]"
          />
          <div className="min-w-0 flex-1 flex flex-col justify-between h-full py-0.5">
            <div>
              <h3 className="text-sm font-bold text-white line-clamp-2 leading-snug group-hover:text-[var(--sx-primary)] transition-colors">
                {title}
              </h3>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/75 tabular-nums">
                {media.format && <span>{media.format}</span>}
                {scoreStr && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-0.5 text-amber-400 font-semibold">
                      <Star className="w-3 h-3 fill-amber-400" />
                      {scoreStr}
                    </span>
                  </>
                )}
                {media.episodes && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{media.episodes} eps</span>
                  </>
                )}
              </div>
            </div>
            {progressLabel && (
              <div className="text-[11px] font-semibold text-[var(--sx-primary)]">
                {progressLabel}
              </div>
            )}
          </div>
        </div>
        {typeof progressPercent === 'number' && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/15 z-20">
            <div
              className="h-full bg-[var(--sx-primary)] transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(4, progressPercent * 100))}%` }}
            />
          </div>
        )}
      </button>
    );
  }

  const widthClass = fullWidth
    ? 'w-full'
    : cardStyle === 'compact'
      ? 'shrink-0 w-[122px] sm:w-[132px]'
      : cardStyle === 'minimal'
        ? 'shrink-0 w-[134px] sm:w-[144px]'
        : 'shrink-0 w-[148px] sm:w-[162px]';

  const containerStyle =
    cardStyle === 'material'
      ? 'sx-glass-panel p-2 border border-[var(--sx-outline)] hover:border-[var(--sx-primary)]/45'
      : cardStyle === 'neon'
        ? 'sx-glass-panel border border-[var(--sx-outline)] hover:border-[var(--sx-primary)] hover:shadow-[0_0_20px_-4px_var(--sx-primary)]'
        : cardStyle === 'editorial'
          ? 'bg-transparent'
          : 'bg-transparent';

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ borderRadius: roundness, ...entranceStyle }}
      className={`group text-left flex flex-col sx-card-spring ${entranceClass} focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)] ${widthClass} ${containerStyle}`}
    >
      <div
        style={{ borderRadius: cardStyle === 'material' ? `calc(${roundness} - 4px)` : roundness }}
        className="relative w-full aspect-[2/3] overflow-hidden bg-[var(--sx-surface-high)] border border-[var(--sx-outline)]/60 group-hover:border-[var(--sx-primary)]/45 group-hover:shadow-[0_14px_28px_-12px_rgba(0,0,0,0.45)] transition-all duration-200"
      >
        <SmartImage
          src={media.cover}
          alt={title}
          fallbackTitle={title}
          className="w-full h-full group-hover:scale-[1.06] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        />
        {(cardStyle === 'expressive' || cardStyle === 'editorial') && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        )}
        {scoreStr && cardStyle !== 'minimal' && (
          <div className="absolute top-2 right-2 flex items-center gap-1 rounded-lg bg-black/75 px-1.5 py-0.5 text-[11px] font-bold text-white backdrop-blur-md border border-white/10 tabular-nums transition-transform duration-200 group-hover:scale-105">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span>{scoreStr}</span>
          </div>
        )}
        {progressLabel && (
          <div className="absolute bottom-2 left-2 right-2 text-[11px] font-bold text-white drop-shadow">
            {progressLabel}
          </div>
        )}
        {typeof progressPercent === 'number' && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
            <div
              className="h-full bg-[var(--sx-primary)] transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(4, progressPercent * 100))}%` }}
            />
          </div>
        )}
      </div>

      <div className={`mt-2 px-0.5 ${cardStyle === 'editorial' ? 'border-t border-[var(--sx-outline)] pt-1.5' : ''}`}>
        <h3 className="text-[13px] font-bold text-[var(--sx-on-surface)] line-clamp-2 leading-snug group-hover:text-[var(--sx-primary)] transition-colors">
          {title}
        </h3>
        {cardStyle !== 'compact' && (
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--sx-on-surface-muted)] tabular-nums truncate">
            <span>{media.format || media.type}</span>
            {media.year && (
              <>
                <span aria-hidden="true">·</span>
                <span>{media.year}</span>
              </>
            )}
            {cardStyle === 'minimal' && scoreStr && (
              <>
                <span aria-hidden="true">·</span>
                <span>★ {scoreStr}</span>
              </>
            )}
          </div>
        )}
      </div>
    </button>
  );
};
