import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Flame, Info, Play, Star } from 'lucide-react';
import { HeroBannerStyle } from '../data/themePresets';
import { useApp } from '../store/AppContext';
import { getPreferredTitle, UnifiedMedia } from '../types/media';
import { SmartImage } from './SmartImage';
import {
  formatHeroMetadata,
  formatHeroScore,
  formatHeroSlideCounter,
  getHeroCtaLabel,
  getHeroRankBadgeLabel,
  resolveHeroBannerStyle,
  selectHeroSlides,
  stripHtmlTags,
  wrapSlideIndex,
} from '../utils/heroBanner';
import { getCoverflowCardMetrics } from '../utils/cardMotion';

interface HeroBannerCarouselProps {
  items: UnifiedMedia[];
  loading?: boolean;
  paused?: boolean;
  styleOverride?: HeroBannerStyle;
  onSelectMedia: (media: UnifiedMedia) => void;
  onWatchNow?: (media: UnifiedMedia) => void;
}

export const HeroBannerCarousel: React.FC<HeroBannerCarouselProps> = ({
  items,
  loading = false,
  paused = false,
  styleOverride,
  onSelectMedia,
  onWatchNow,
}) => {
  const { state } = useApp();
  const bannerStyle = resolveHeroBannerStyle(styleOverride ?? state.uiPrefs.heroBannerStyle);
  const slides = selectHeroSlides(items, 5);
  const [activeIndex, setActiveIndex] = useState(0);
  const [slideChangeCount, setSlideChangeCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const safeIndex = slides.length > 0 ? Math.min(activeIndex, slides.length - 1) : 0;
  const activeItem = slides[safeIndex];

  useEffect(() => {
    if (slides.length <= 1 || isPaused || paused) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((prev) => wrapSlideIndex(prev, 1, slides.length));
      setSlideChangeCount((c) => c + 1);
    }, 6500);

    return () => window.clearInterval(timer);
  }, [slides.length, isPaused, paused]);

  if (loading && slides.length === 0) {
    return (
      <section aria-label="Featured Hero Banner" className="mx-4 sm:mx-6">
        <div
          style={{ borderRadius: 'calc(var(--sx-radius) + 6px)' }}
          className="h-[245px] sm:h-[315px] lg:h-[375px] w-full bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] animate-pulse"
        />
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {[0, 1, 2, 3].map((dot) => (
            <span
              key={dot}
              className={`h-1.5 rounded-full ${
                dot === 0
                  ? 'w-6 bg-[var(--sx-primary)]/40'
                  : 'w-2 bg-[var(--sx-surface-high)]'
              }`}
            />
          ))}
        </div>
      </section>
    );
  }

  if (!activeItem) {
    return null;
  }

  const handlePrev = () => {
    setActiveIndex((prev) => wrapSlideIndex(prev, -1, slides.length));
    setSlideChangeCount((c) => c + 1);
  };

  const handleNext = () => {
    setActiveIndex((prev) => wrapSlideIndex(prev, 1, slides.length));
    setSlideChangeCount((c) => c + 1);
  };

  const handleDotSelect = (idx: number) => {
    if (idx === safeIndex) return;
    setActiveIndex(idx);
    setSlideChangeCount((c) => c + 1);
  };

  const slideAnimClass = slideChangeCount > 0 ? 'sx-hero-enter' : '';
  const slideAnimKey = slideChangeCount > 0 ? `${activeItem.id}-${slideChangeCount}` : 'initial';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handlePrev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleNext();
    }
  };

  const swipeProps = {
    onTouchStart: (e: React.TouchEvent) => {
      touchStartX.current = e.touches[0]?.clientX ?? null;
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (touchStartX.current === null || slides.length <= 1) return;
      const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
      const dx = endX - touchStartX.current;
      touchStartX.current = null;
      if (Math.abs(dx) > 40) {
        if (dx < 0) handleNext();
        else handlePrev();
      }
    },
  };

  const activeTitle = getPreferredTitle(activeItem.title, state.contentPrefs.titlePreference);
  const activeMeta = formatHeroMetadata(activeItem);
  const activeScore = formatHeroScore(activeItem.score);
  const activeSynopsis = stripHtmlTags(activeItem.description);
  const activeCta = getHeroCtaLabel(activeItem.type);
  const activeIsReading = activeItem.type === 'MANGA' || activeItem.type === 'NOVEL';

  // 1. Classic Style (Matches reference screenshot: pill badges, edge arrows, frosted pill CTA, dash indicators)
  if (bannerStyle === 'classic') {
    return (
      <section
        aria-label="Featured Hero Banner"
        data-testid="hero-banner-carousel"
        data-banner-style="classic"
        className="mx-4 sm:mx-6"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={() => setIsPaused(false)}
        onKeyDown={handleKeyDown}
      >
        <div className="relative group" {...swipeProps}>
          <div
            style={{ borderRadius: 'calc(var(--sx-radius) + 6px)' }}
            className="relative h-[245px] sm:h-[320px] lg:h-[380px] w-full overflow-hidden border border-[var(--sx-outline)] bg-[var(--sx-surface-container)] shadow-xl"
          >
            <div key={slideAnimKey} className={`absolute inset-0 z-0 overflow-hidden ${slideAnimClass}`}>
              <SmartImage
                src={activeItem.banner || activeItem.cover}
                alt={activeTitle}
                fallbackTitle={activeTitle}
                className="w-full h-full transition-transform duration-700 ease-out group-hover:scale-[1.03]"
              />
            </div>

            <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-t from-black/95 via-black/45 to-black/20" />
            <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-r from-black/75 via-black/25 to-transparent" />

            <button
              type="button"
              data-no-press="true"
              onClick={() => onSelectMedia(activeItem)}
              aria-label={`Open details for ${activeTitle}`}
              className="absolute inset-0 z-10 w-full h-full text-left focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)] cursor-pointer"
            />

            <div
              key={`classic-meta-${slideAnimKey}`}
              className={`pointer-events-none absolute inset-0 z-20 flex flex-col justify-between px-5 py-3.5 sm:px-7 sm:py-6 lg:px-9 lg:py-7 ${slideAnimClass}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  data-testid="hero-rank-badge"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/95 text-slate-950 text-[11px] sm:text-xs font-extrabold shadow-md whitespace-nowrap"
                >
                  <span>{getHeroRankBadgeLabel(safeIndex, activeItem.type)}</span>
                  <Flame className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
                </span>

                {activeScore && (
                  <span
                    data-testid="hero-score-badge"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/65 backdrop-blur-md text-white border border-white/15 text-[11px] sm:text-xs font-bold tabular-nums shadow-md whitespace-nowrap"
                  >
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span>{activeScore}</span>
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                <h2
                  data-testid="hero-slide-title"
                  className="text-xl sm:text-3xl lg:text-4xl font-black text-white leading-tight tracking-tight line-clamp-2 drop-shadow text-balance max-w-2xl"
                >
                  {activeTitle}
                </h2>

                {activeMeta.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:text-sm font-semibold text-white/90 tabular-nums">
                    {activeMeta.map((part, partIdx) => (
                      <React.Fragment key={`${part}-${partIdx}`}>
                        {partIdx > 0 && (
                          <span aria-hidden="true" className="text-white/55">
                            ·
                          </span>
                        )}
                        <span>{part}</span>
                      </React.Fragment>
                    ))}
                  </div>
                )}

                <div className="pt-0.5 flex flex-row items-end justify-between gap-3 sm:gap-6">
                  {activeSynopsis ? (
                    <p className="min-w-0 flex-1 text-[11px] sm:text-xs text-white/75 line-clamp-2 leading-snug sm:leading-relaxed max-w-xl">
                      {activeSynopsis}
                    </p>
                  ) : (
                    <div className="flex-1" />
                  )}

                  <button
                    type="button"
                    onClick={() => (onWatchNow ? onWatchNow(activeItem) : onSelectMedia(activeItem))}
                    className="pointer-events-auto self-end inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full bg-black/60 hover:bg-[var(--sx-primary)] text-white hover:text-[var(--sx-on-primary)] border border-white/25 hover:border-[var(--sx-primary)] backdrop-blur-md text-xs sm:text-sm font-bold transition-all duration-150 active:scale-95 whitespace-nowrap shrink-0 shadow-lg focus-visible:outline-2 focus-visible:outline-white"
                  >
                    {activeIsReading ? (
                      <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    ) : (
                      <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" />
                    )}
                    <span>{activeCta}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {slides.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous featured slide"
                className="absolute -left-2.5 sm:-left-3.5 top-1/2 -translate-y-1/2 z-30 w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center bg-[#18191f]/90 hover:bg-[var(--sx-primary)] text-white hover:text-[var(--sx-on-primary)] border border-white/15 backdrop-blur-md transition-all duration-150 active:scale-90 focus-visible:outline-2 focus-visible:outline-white shadow-lg"
              >
                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next featured slide"
                className="absolute -right-2.5 sm:-right-3.5 top-1/2 -translate-y-1/2 z-30 w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center bg-[#18191f]/90 hover:bg-[var(--sx-primary)] text-white hover:text-[var(--sx-on-primary)] border border-white/15 backdrop-blur-md transition-all duration-150 active:scale-90 focus-visible:outline-2 focus-visible:outline-white shadow-lg"
              >
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </>
          )}
        </div>

        {slides.length > 1 && (
          <div
            className="mt-2.5 flex items-center justify-center gap-1"
            role="tablist"
            aria-label="Hero banner slides"
          >
            {slides.map((slide, idx) => {
              const active = idx === safeIndex;
              const slideTitle = getPreferredTitle(
                slide.title,
                state.contentPrefs.titlePreference,
              );
              return (
                <button
                  key={slide.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={`Slide ${idx + 1}: ${slideTitle}`}
                  onClick={() => handleDotSelect(idx)}
                  className="py-2 px-1 flex items-center justify-center focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)] rounded"
                >
                  <span
                    className={`block h-1 rounded-full transition-all duration-300 ease-out ${
                      active
                        ? 'w-6 bg-[var(--sx-primary)]'
                        : 'w-3 bg-[var(--sx-on-surface-muted)]/35 hover:bg-[var(--sx-on-surface-muted)]/65'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  // 2. Cinematic Style (Widescreen centered theatrical spotlight + progress bars)
  if (bannerStyle === 'cinematic') {
    return (
      <section
        aria-label="Featured Hero Banner"
        data-testid="hero-banner-carousel"
        data-banner-style="cinematic"
        className="mx-4 sm:mx-6"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={() => setIsPaused(false)}
        onKeyDown={handleKeyDown}
      >
        <div
          {...swipeProps}
          style={{ borderRadius: 'calc(var(--sx-radius) + 8px)' }}
          className="relative group h-[290px] sm:h-[360px] lg:h-[420px] w-full overflow-hidden border border-[var(--sx-outline)] bg-[var(--sx-surface-container)] shadow-2xl"
        >
          <div key={slideAnimKey} className={`absolute inset-0 z-0 overflow-hidden ${slideAnimClass}`}>
            <SmartImage
              src={activeItem.banner || activeItem.cover}
              alt={activeTitle}
              fallbackTitle={activeTitle}
              className="w-full h-full transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            />
          </div>

          <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-t from-black via-black/55 to-black/20" />
          <div className="pointer-events-none absolute inset-0 z-[5] bg-radial from-transparent via-black/10 to-black/55" />

          <button
            type="button"
            data-no-press="true"
            onClick={() => onSelectMedia(activeItem)}
            aria-label={`Open details for ${activeTitle}`}
            className="absolute inset-0 z-10 w-full h-full focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)] cursor-pointer"
          />

          <div
            key={`cinematic-meta-${slideAnimKey}`}
            className={`pointer-events-none absolute inset-0 z-20 flex flex-col justify-end items-center text-center p-5 sm:p-8 lg:p-10 ${slideAnimClass}`}
          >
            <div className="max-w-2xl space-y-2">
              <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs font-bold uppercase tracking-widest text-white/85 tabular-nums">
                <span className="text-[var(--sx-primary)]">
                  {getHeroRankBadgeLabel(safeIndex, activeItem.type)}
                </span>
                {activeScore && (
                  <>
                    <span aria-hidden="true" className="text-white/45">
                      ·
                    </span>
                    <span className="inline-flex items-center gap-1 text-white">
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      {activeScore}
                    </span>
                  </>
                )}
                {activeMeta.slice(0, 3).map((part) => (
                  <React.Fragment key={part}>
                    <span aria-hidden="true" className="text-white/45">
                      ·
                    </span>
                    <span>{part}</span>
                  </React.Fragment>
                ))}
              </div>

              <h2
                data-testid="hero-slide-title"
                className="text-xl sm:text-3xl lg:text-4xl font-black text-white leading-tight tracking-tight line-clamp-2 drop-shadow text-balance"
              >
                {activeTitle}
              </h2>

              {activeSynopsis && (
                <p className="hidden sm:block text-xs sm:text-sm text-white/75 line-clamp-2 max-w-xl mx-auto">
                  {activeSynopsis}
                </p>
              )}

              <div className="pt-2 flex items-center justify-center gap-2.5 pointer-events-auto">
                <button
                  type="button"
                  onClick={() => (onWatchNow ? onWatchNow(activeItem) : onSelectMedia(activeItem))}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--sx-primary)] hover:brightness-110 text-[var(--sx-on-primary)] text-xs sm:text-sm font-bold transition-all active:scale-95 whitespace-nowrap shadow-lg focus-visible:outline-2 focus-visible:outline-white"
                >
                  {activeIsReading ? (
                    <BookOpen className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4 fill-current" />
                  )}
                  <span>{activeCta}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectMedia(activeItem)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/20 backdrop-blur-md text-xs sm:text-sm font-bold transition-all active:scale-95 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-white"
                >
                  <Info className="w-4 h-4" />
                  <span>Details</span>
                </button>
              </div>
            </div>
          </div>

          {slides.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous featured slide"
                className="absolute left-3 top-4 sm:top-1/2 sm:-translate-y-1/2 z-30 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-black/55 hover:bg-[var(--sx-primary)] text-white border border-white/15 backdrop-blur-md transition-all active:scale-90"
              >
                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next featured slide"
                className="absolute right-3 top-4 sm:top-1/2 sm:-translate-y-1/2 z-30 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-black/55 hover:bg-[var(--sx-primary)] text-white border border-white/15 backdrop-blur-md transition-all active:scale-90"
              >
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </>
          )}
        </div>

        {slides.length > 1 && (
          <div
            className="mt-2.5 grid gap-1.5 max-w-md mx-auto"
            style={{ gridTemplateColumns: `repeat(${slides.length}, minmax(0, 1fr))` }}
            role="tablist"
            aria-label="Hero banner slides"
          >
            {slides.map((slide, idx) => {
              const active = idx === safeIndex;
              const slideTitle = getPreferredTitle(
                slide.title,
                state.contentPrefs.titlePreference,
              );
              return (
                <button
                  key={slide.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={`Slide ${idx + 1}: ${slideTitle}`}
                  onClick={() => handleDotSelect(idx)}
                  className="py-1.5 flex items-center focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)] rounded"
                >
                  <span
                    className={`block w-full h-1 rounded-full transition-all duration-300 ${
                      active
                        ? 'bg-[var(--sx-primary)]'
                        : 'bg-[var(--sx-on-surface-muted)]/25 hover:bg-[var(--sx-on-surface-muted)]/55'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  // 3. Poster Spotlight Style (Blurred backdrop + elevated portrait poster + quick details)
  if (bannerStyle === 'splitPoster') {
    const unitCount = activeIsReading ? activeItem.chapters : activeItem.episodes;
    const unitLabel = activeIsReading ? 'Ch' : 'Ep';

    return (
      <section
        aria-label="Featured Hero Banner"
        data-testid="hero-banner-carousel"
        data-banner-style="splitPoster"
        className="mx-4 sm:mx-6"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={() => setIsPaused(false)}
        onKeyDown={handleKeyDown}
      >
        <div
          {...swipeProps}
          style={{ borderRadius: 'calc(var(--sx-radius) + 6px)' }}
          className="relative group min-h-[240px] sm:min-h-[300px] lg:min-h-[340px] w-full overflow-hidden border border-[var(--sx-outline)] bg-[var(--sx-surface-container)] shadow-xl flex items-center"
        >
          {/* Blurred Ambient Backdrop */}
          <div key={slideAnimKey} className={`absolute inset-0 z-0 overflow-hidden ${slideAnimClass}`}>
            <SmartImage
              src={activeItem.banner || activeItem.cover}
              alt=""
              fallbackTitle={activeTitle}
              className="w-full h-full scale-110 blur-md brightness-50"
            />
          </div>
          <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-r from-black/90 via-black/75 to-black/50" />

          <div
            key={`split-meta-${slideAnimKey}`}
            className={`relative z-20 w-full flex items-center gap-4 sm:gap-7 p-4 sm:p-7 lg:p-9 ${slideAnimClass}`}
          >
            {/* Portrait Poster Cover */}
            <button
              type="button"
              onClick={() => onSelectMedia(activeItem)}
              aria-label={`Open poster details for ${activeTitle}`}
              className="relative w-[104px] sm:w-[144px] lg:w-[170px] aspect-[2/3] rounded-xl overflow-hidden border border-white/15 shadow-2xl shrink-0 bg-[var(--sx-surface-high)] transition-transform duration-200 hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
            >
              <SmartImage
                src={activeItem.cover || activeItem.banner}
                alt={activeTitle}
                fallbackTitle={activeTitle}
                className="w-full h-full"
              />
            </button>

            {/* Right Metadata + Actions */}
            <div className="min-w-0 flex-1 space-y-2 sm:space-y-2.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs font-bold text-white/85 tabular-nums">
                <span className="text-[var(--sx-primary)] uppercase tracking-wider whitespace-nowrap">
                  {getHeroRankBadgeLabel(safeIndex, activeItem.type)}
                </span>
                {activeScore && (
                  <span className="inline-flex items-center gap-1 text-white whitespace-nowrap">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    {activeScore}
                  </span>
                )}
                {unitCount ? (
                  <span className="text-white/75 whitespace-nowrap">
                    {unitCount} {unitLabel}
                  </span>
                ) : null}
              </div>

              <h2
                data-testid="hero-slide-title"
                className="text-base sm:text-2xl lg:text-3xl font-black text-white leading-tight tracking-tight line-clamp-2 text-balance"
              >
                {activeTitle}
              </h2>

              {activeMeta.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] sm:text-xs font-semibold text-white/75 tabular-nums">
                  {activeMeta.map((part, idx) => (
                    <React.Fragment key={`${part}-${idx}`}>
                      {idx > 0 && <span aria-hidden="true">·</span>}
                      <span>{part}</span>
                    </React.Fragment>
                  ))}
                </div>
              )}

              {activeSynopsis && (
                <p className="text-[11px] sm:text-xs text-white/75 line-clamp-2 sm:line-clamp-3 leading-snug sm:leading-relaxed max-w-2xl">
                  {activeSynopsis}
                </p>
              )}

              <div className="pt-1 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => (onWatchNow ? onWatchNow(activeItem) : onSelectMedia(activeItem))}
                  className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-[var(--sx-primary)] hover:brightness-110 text-[var(--sx-on-primary)] text-[11px] sm:text-xs font-bold transition-all active:scale-95 whitespace-nowrap shadow-md"
                >
                  {activeIsReading ? (
                    <BookOpen className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                  <span>{activeCta}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectMedia(activeItem)}
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-white/12 hover:bg-white/20 text-white border border-white/15 text-[11px] sm:text-xs font-bold transition-all active:scale-95 whitespace-nowrap"
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>Details</span>
                </button>
              </div>
            </div>
          </div>

          {slides.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous featured slide"
                className="hidden sm:flex absolute left-2.5 top-1/2 -translate-y-1/2 z-30 w-9 h-9 rounded-full items-center justify-center bg-black/60 hover:bg-[var(--sx-primary)] text-white border border-white/15 backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next featured slide"
                className="hidden sm:flex absolute right-2.5 top-1/2 -translate-y-1/2 z-30 w-9 h-9 rounded-full items-center justify-center bg-black/60 hover:bg-[var(--sx-primary)] text-white border border-white/15 backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {slides.length > 1 && (
          <div
            className="mt-2.5 flex items-center justify-center gap-1"
            role="tablist"
            aria-label="Hero banner slides"
          >
            {slides.map((slide, idx) => {
              const active = idx === safeIndex;
              const slideTitle = getPreferredTitle(
                slide.title,
                state.contentPrefs.titlePreference,
              );
              return (
                <button
                  key={slide.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={`Slide ${idx + 1}: ${slideTitle}`}
                  onClick={() => handleDotSelect(idx)}
                  className="py-2 px-1 flex items-center justify-center rounded"
                >
                  <span
                    className={`block h-1.5 rounded-full transition-all duration-300 ${
                      active
                        ? 'w-6 bg-[var(--sx-primary)]'
                        : 'w-2 bg-[var(--sx-on-surface-muted)]/35 hover:bg-[var(--sx-on-surface-muted)]/65'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  // 4. Minimal Style (Compact editorial strip + tabular counter & micro nav)
  if (bannerStyle === 'minimal') {
    return (
      <section
        aria-label="Featured Hero Banner"
        data-testid="hero-banner-carousel"
        data-banner-style="minimal"
        className="mx-4 sm:mx-6"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={() => setIsPaused(false)}
        onKeyDown={handleKeyDown}
      >
        <div
          {...swipeProps}
          style={{ borderRadius: 'calc(var(--sx-radius) + 4px)' }}
          className="relative group h-[205px] sm:h-[250px] lg:h-[290px] w-full overflow-hidden border border-[var(--sx-outline)] bg-[var(--sx-surface-container)] shadow-lg"
        >
          <div key={slideAnimKey} className={`absolute inset-0 z-0 overflow-hidden ${slideAnimClass}`}>
            <SmartImage
              src={activeItem.banner || activeItem.cover}
              alt={activeTitle}
              fallbackTitle={activeTitle}
              className="w-full h-full transition-transform duration-700 ease-out group-hover:scale-[1.02]"
            />
          </div>
          <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-t from-black/95 via-black/40 to-transparent" />

          <button
            type="button"
            data-no-press="true"
            onClick={() => onSelectMedia(activeItem)}
            aria-label={`Open details for ${activeTitle}`}
            className="absolute inset-0 z-10 w-full h-full focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)] cursor-pointer"
          />

          <div
            key={`minimal-meta-${slideAnimKey}`}
            className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 p-4 sm:p-6 flex items-end justify-between gap-4 ${slideAnimClass}`}
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 text-[11px] sm:text-xs font-bold text-white/80 tabular-nums">
                <span className="text-[var(--sx-primary)]">#{safeIndex + 1}</span>
                {activeMeta.slice(0, 2).map((part) => (
                  <React.Fragment key={part}>
                    <span aria-hidden="true" className="text-white/40">
                      ·
                    </span>
                    <span>{part}</span>
                  </React.Fragment>
                ))}
                {activeScore && (
                  <>
                    <span aria-hidden="true" className="text-white/40">
                      ·
                    </span>
                    <span className="inline-flex items-center gap-1 text-white">
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                      {activeScore}
                    </span>
                  </>
                )}
              </div>

              <h2
                data-testid="hero-slide-title"
                className="text-lg sm:text-2xl lg:text-3xl font-black text-white leading-tight tracking-tight line-clamp-1 sm:line-clamp-2 drop-shadow"
              >
                {activeTitle}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => (onWatchNow ? onWatchNow(activeItem) : onSelectMedia(activeItem))}
              className="pointer-events-auto shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--sx-primary)] hover:brightness-110 text-[var(--sx-on-primary)] text-xs font-bold transition-all active:scale-95 whitespace-nowrap shadow-md"
            >
              {activeIsReading ? (
                <BookOpen className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>{activeCta}</span>
            </button>
          </div>
        </div>

        {slides.length > 1 && (
          <div className="mt-2 flex items-center justify-between gap-3 px-1">
            <span className="text-[11px] font-mono-tabular font-bold text-[var(--sx-on-surface-muted)]">
              {formatHeroSlideCounter(safeIndex, slides.length)}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous featured slide"
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-primary)] hover:border-[var(--sx-primary)] transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next featured slide"
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-primary)] hover:border-[var(--sx-primary)] transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </section>
    );
  }

  // 5. 3D Coverflow Style (ShizuTv Coverflow spotlight with flanking cards)
  return (
    <section
      aria-label="Featured Hero Banner"
      data-testid="hero-banner-carousel"
      data-banner-style="coverflow"
      className="mx-3 sm:mx-6"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
      onKeyDown={handleKeyDown}
    >
      <div
        className="relative group"
        style={{ perspective: '1200px' }}
        {...swipeProps}
      >
        {/* 3D Coverflow Stage */}
        <div className="relative h-[265px] sm:h-[330px] lg:h-[385px] w-full overflow-hidden">
          {slides.map((slide, idx) => {
            const metrics = getCoverflowCardMetrics(idx, safeIndex, slides.length);
            const isActive = metrics.slot === 'active';
            const isVisibleFlank = metrics.slot === 'prev' || metrics.slot === 'next';
            const title = getPreferredTitle(slide.title, state.contentPrefs.titlePreference);
            const metaParts = formatHeroMetadata(slide);
            const scoreText = formatHeroScore(slide.score);
            const synopsis = stripHtmlTags(slide.description);
            const ctaLabel = getHeroCtaLabel(slide.type);
            const isReading = slide.type === 'MANGA' || slide.type === 'NOVEL';

            return (
              <div
                key={slide.id}
                aria-hidden={!isActive}
                style={{
                  borderRadius: 'calc(var(--sx-radius) + 6px)',
                  zIndex: metrics.zIndex,
                  opacity: metrics.opacity,
                  transform: `translate3d(${metrics.translateXPercent}%, 0, 0) scale(${metrics.scale}) rotateY(${metrics.rotateYDeg}deg)`,
                  pointerEvents: isActive || isVisibleFlank ? 'auto' : 'none',
                }}
                className={`sx-coverflow-slide absolute inset-y-0 left-1/2 -translate-x-1/2 overflow-hidden border bg-[var(--sx-surface-container)] shadow-2xl ${
                  slides.length > 1
                    ? 'w-[90%] sm:w-[84%] lg:w-[78%]'
                    : 'w-full'
                } ${
                  isActive
                    ? 'border-[var(--sx-outline)] shadow-[0_24px_50px_-15px_rgba(0,0,0,0.65)]'
                    : 'border-[var(--sx-outline)]/60 brightness-75'
                }`}
              >
                <div className="absolute inset-0 z-0 overflow-hidden">
                  <SmartImage
                    src={slide.banner || slide.cover}
                    alt={title}
                    fallbackTitle={title}
                    className={`w-full h-full transition-transform duration-700 ease-out ${
                      isActive ? 'group-hover:scale-[1.03]' : ''
                    }`}
                  />
                </div>

                <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-t from-black/95 via-black/45 to-black/20" />
                <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-r from-black/75 via-black/25 to-transparent" />

                <button
                  type="button"
                  data-no-press="true"
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => {
                    if (isActive) onSelectMedia(slide);
                    else setActiveIndex(idx);
                  }}
                  aria-label={
                    isActive ? `Open details for ${title}` : `Focus slide: ${title}`
                  }
                  className="absolute inset-0 z-10 w-full h-full text-left focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)] cursor-pointer"
                />

                {isActive && (
                  <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-4 sm:p-6 lg:p-7">
                    <div className="flex items-center justify-between gap-3">
                      <span
                        data-testid="hero-rank-badge"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/95 text-slate-950 text-[11px] sm:text-xs font-extrabold shadow-sm whitespace-nowrap shrink-0"
                      >
                        <span>{getHeroRankBadgeLabel(safeIndex, slide.type)}</span>
                        <Flame className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
                      </span>

                      {scoreText && (
                        <span
                          data-testid="hero-score-badge"
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/65 backdrop-blur-md text-white border border-white/15 text-[11px] sm:text-xs font-bold tabular-nums whitespace-nowrap shrink-0"
                        >
                          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                          <span>{scoreText}</span>
                        </span>
                      )}
                    </div>

                    <div className="flex flex-row items-end justify-between gap-3 sm:gap-6">
                      <div className="min-w-0 flex-1 max-w-2xl space-y-1">
                        <h2
                          data-testid="hero-slide-title"
                          className="text-lg sm:text-3xl lg:text-4xl font-black text-white leading-tight tracking-tight line-clamp-2 drop-shadow"
                        >
                          {title}
                        </h2>

                        {metaParts.length > 0 && (
                          <div className="flex flex-wrap items-center gap-x-1.5 sm:gap-x-2 gap-y-0.5 text-[11px] sm:text-sm font-semibold text-white/90 tabular-nums">
                            {metaParts.map((part, partIdx) => (
                              <React.Fragment key={`${part}-${partIdx}`}>
                                {partIdx > 0 && (
                                  <span aria-hidden="true" className="text-white/50">
                                    ·
                                  </span>
                                )}
                                <span>{part}</span>
                              </React.Fragment>
                            ))}
                          </div>
                        )}

                        {synopsis && (
                          <p className="text-[10px] sm:text-xs text-white/75 line-clamp-2 leading-snug sm:leading-relaxed max-w-xl">
                            {synopsis}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => (onWatchNow ? onWatchNow(slide) : onSelectMedia(slide))}
                        className="pointer-events-auto self-end inline-flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-full bg-[var(--sx-primary)] hover:brightness-110 text-[var(--sx-on-primary)] text-[11px] sm:text-sm font-bold transition-all duration-150 active:scale-95 whitespace-nowrap shrink-0 shadow-lg focus-visible:outline-2 focus-visible:outline-white"
                      >
                        {isReading ? (
                          <BookOpen className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current" />
                        )}
                        <span>{ctaLabel}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Previous featured slide"
              className="absolute left-1 sm:left-3 top-[36%] sm:top-1/2 -translate-y-1/2 z-30 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-black/70 hover:bg-[var(--sx-primary)] text-white hover:text-[var(--sx-on-primary)] border border-white/15 backdrop-blur-md transition-all duration-150 active:scale-90 focus-visible:outline-2 focus-visible:outline-white shadow-lg"
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              aria-label="Next featured slide"
              className="absolute right-1 sm:right-3 top-[36%] sm:top-1/2 -translate-y-1/2 z-30 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-black/70 hover:bg-[var(--sx-primary)] text-white hover:text-[var(--sx-on-primary)] border border-white/15 backdrop-blur-md transition-all duration-150 active:scale-90 focus-visible:outline-2 focus-visible:outline-white shadow-lg"
            >
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </>
        )}
      </div>

      {slides.length > 1 && (
        <div
          className="mt-2.5 flex items-center justify-center gap-1"
          role="tablist"
          aria-label="Hero banner slides"
        >
          {slides.map((slide, idx) => {
            const active = idx === safeIndex;
            const slideTitle = getPreferredTitle(
              slide.title,
              state.contentPrefs.titlePreference,
            );
            return (
              <button
                key={slide.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`Slide ${idx + 1}: ${slideTitle}`}
                onClick={() => setActiveIndex(idx)}
                className="py-2 px-1 flex items-center justify-center focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)] rounded"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all duration-300 ease-out ${
                    active
                      ? 'w-7 bg-[var(--sx-primary)]'
                      : 'w-2.5 bg-[var(--sx-on-surface-muted)]/35 hover:bg-[var(--sx-on-surface-muted)]/65'
                  }`}
                />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};
