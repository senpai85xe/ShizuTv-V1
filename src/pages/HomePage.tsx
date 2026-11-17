import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowDown, BookOpen, Check, RefreshCw, Tv } from 'lucide-react';
import { useApp } from '../store/AppContext';
import {
  HomeSection,
  LibraryEntry,
  MediaType,
  UnifiedMedia,
} from '../types/media';
import { fetchDiscoveryCategory } from '../services/discoveryService';
import { fetchAniListUserLibrary } from '../services/anilist';
import { HomeHeader } from '../components/HomeHeader';
import { HeroBannerCarousel } from '../components/HeroBannerCarousel';
import { HorizontalSection } from '../components/HorizontalSection';
import { LazySection } from '../components/LazySection';
import { MediaCard } from '../components/MediaCard';
import { ScrollReveal } from '../components/ScrollReveal';
import { DiscoveryModeModal } from '../components/DiscoveryModeModal';
import { ProfileSheetModal } from '../components/ProfileSheetModal';
import { TrackerProfileModal } from '../components/TrackerProfileModal';
import {
  formatContinueStepLabel,
  formatRemainingLabel,
  mergeContinueHistoryItems,
} from '../utils/mediaCard';
import {
  canTriggerLazySection,
  clearSectionFetchKey,
  getObserverLoadResetKey,
  getSectionFetchKey,
  shouldEagerLoadSection,
} from '../utils/lazySection';
import {
  filterHomeSectionsByMediaMode,
  HomeMediaMode,
  isTrendingDiscoveryRow,
} from '../utils/heroBanner';
import {
  completeHomeModeTransition,
  createInitialHomeModeTransition,
  HOME_MODE_TRANSITION_MS,
  startHomeModeTransition,
} from '../utils/homeModeTransition';
import { shouldOpenProfileSheet } from '../utils/themeDefaults';
import { useScrollPersistence } from '../hooks/useScrollPersistence';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { computePullIndicatorScale } from '../utils/pullToRefresh';

const HOME_MEDIA_MODE_KEY = 'shonenx_home_media_mode';

function readInitialHomeMediaMode(): HomeMediaMode {
  try {
    const saved = sessionStorage.getItem(HOME_MEDIA_MODE_KEY);
    return saved === 'MANGA' ? 'MANGA' : 'ANIME';
  } catch {
    return 'ANIME';
  }
}

interface FeedState {
  items: UnifiedMedia[];
  loading: boolean;
  error: string | null;
}

const homeFeedsCache = new Map<string, Record<string, FeedState>>();

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const {
    state,
    effectiveMetadataTracker,
    updateDiscoveryPrefs,
    addLog,
    removeHistoryItem,
  } = useApp();
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [discoveryModalOpen, setDiscoveryModalOpen] = useState(false);

  const activeSections = state.homeSections.filter((s) => !s.disabled);
  const loadResetKey = getObserverLoadResetKey(
    effectiveMetadataTracker,
    state.contentPrefs.adultContentMode,
  );

  const [feeds, setFeeds] = useState<Record<string, FeedState>>(
    () => homeFeedsCache.get(loadResetKey) ?? {},
  );
  const [cloudContinueFeeds, setCloudContinueFeeds] = useState<
    Record<string, { items: LibraryEntry[]; loading: boolean; error: string | null }>
  >({});
  const [fallbackHeroFeed, setFallbackHeroFeed] = useState<FeedState>({
    items: [],
    loading: false,
    error: null,
  });
  const [outageTracker, setOutageTracker] = useState<string | null>(null);
  const [modeTransition, setModeTransition] = useState(() =>
    createInitialHomeModeTransition(readInitialHomeMediaMode()),
  );
  const homeMediaMode = modeTransition.activeMode;
  const triggeredKeysRef = useRef<Set<string>>(
    (() => {
      const initial = new Set<string>();
      const cached = homeFeedsCache.get(loadResetKey);
      if (cached) {
        for (const [sectionId, feed] of Object.entries(cached)) {
          if (!feed.loading && feed.items.length > 0) {
            initial.add(
              getSectionFetchKey(
                sectionId,
                effectiveMetadataTracker,
                state.contentPrefs.adultContentMode,
              ),
            );
          }
        }
      }
      return initial;
    })(),
  );

  const visibleSections = filterHomeSectionsByMediaMode(activeSections, homeMediaMode);
  const firstDiscoverySection = visibleSections.find((s) => s.type === 'discovery');

  const { isRestoring: isRestoringScroll } = useScrollPersistence({
    routeKey: '/home',
    enabled: true,
  });

  const handleSelectMediaMode = (mode: HomeMediaMode) => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setModeTransition((prev) => startHomeModeTransition(prev, mode, prefersReducedMotion));
    try {
      sessionStorage.setItem(HOME_MEDIA_MODE_KEY, mode);
    } catch {
      // Ignore storage errors
    }
  };

  useEffect(() => {
    if (!modeTransition.isTransitioning) return;
    const activeTransitionId = modeTransition.transitionId;
    const timer = window.setTimeout(() => {
      setModeTransition((prev) => completeHomeModeTransition(prev, activeTransitionId));
    }, HOME_MODE_TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [modeTransition.isTransitioning, modeTransition.transitionId]);

  const prevResetKeyRef = useRef(loadResetKey);
  if (prevResetKeyRef.current !== loadResetKey) {
    prevResetKeyRef.current = loadResetKey;
    triggeredKeysRef.current.clear();
  }
  const activeResetKeyRef = useRef(loadResetKey);
  activeResetKeyRef.current = loadResetKey;

  const loadSection = useCallback(
    async (section: HomeSection) => {
      if (section.type !== 'discovery') return;
      const mediaType: MediaType = section.targetMediaType || 'ANIME';
      const category = section.trackerCategory || 'trending';
      const requestResetKey = activeResetKeyRef.current;

      setFeeds((prev) => ({
        ...prev,
        [section.id]: { items: prev[section.id]?.items || [], loading: true, error: null },
      }));

      try {
        const res = await fetchDiscoveryCategory(
          effectiveMetadataTracker,
          category,
          mediaType,
          state.contentPrefs.adultContentMode,
          1,
        );
        if (activeResetKeyRef.current !== requestResetKey) return;
        setFeeds((prev) => {
          const next = {
            ...prev,
            [section.id]: { items: res.items, loading: false, error: null },
          };
          homeFeedsCache.set(requestResetKey, next);
          return next;
        });
        setOutageTracker(null);
      } catch (err) {
        if (activeResetKeyRef.current !== requestResetKey) return;
        const msg = err instanceof Error ? err.message : 'Failed to fetch feed';
        addLog('ERROR', 'HomeFeed', `${section.title}: ${msg}`);
        setOutageTracker(effectiveMetadataTracker);
        setFeeds((prev) => ({
          ...prev,
          [section.id]: { items: [], loading: false, error: msg },
        }));
      }
    },
    [effectiveMetadataTracker, state.contentPrefs.adultContentMode, addLog],
  );

  const triggerSectionLoad = useCallback(
    (section: HomeSection) => {
      if (section.type !== 'discovery') return;
      const fetchKey = getSectionFetchKey(
        section.id,
        effectiveMetadataTracker,
        state.contentPrefs.adultContentMode,
      );
      if (!canTriggerLazySection(fetchKey, triggeredKeysRef.current)) {
        return;
      }
      triggeredKeysRef.current.add(fetchKey);
      void loadSection(section);
    },
    [effectiveMetadataTracker, state.contentPrefs.adultContentMode, loadSection],
  );

  useEffect(() => {
    const cached = homeFeedsCache.get(loadResetKey);
    setFeeds(cached ?? {});
    setOutageTracker(null);
  }, [loadResetKey]);

  const refreshHomeFeeds = useCallback(async () => {
    homeFeedsCache.delete(loadResetKey);
    triggeredKeysRef.current.clear();
    const discoveryToRefresh = visibleSections.filter((s) => s.type === 'discovery');
    const tasks = discoveryToRefresh.map((sec) => {
      const fetchKey = getSectionFetchKey(
        sec.id,
        effectiveMetadataTracker,
        state.contentPrefs.adultContentMode,
      );
      triggeredKeysRef.current.add(fetchKey);
      return loadSection(sec);
    });
    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    } else {
      try {
        const res = await fetchDiscoveryCategory(
          effectiveMetadataTracker,
          'trending',
          homeMediaMode,
          state.contentPrefs.adultContentMode,
          1,
        );
        setFallbackHeroFeed({ items: res.items, loading: false, error: null });
      } catch (err) {
        setFallbackHeroFeed({
          items: [],
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to refresh hero feed',
        });
      }
    }
    addLog('INFO', 'HomeRefresh', `Refreshed ${homeMediaMode} home sections`);
  }, [
    loadResetKey,
    visibleSections,
    effectiveMetadataTracker,
    state.contentPrefs.adultContentMode,
    loadSection,
    homeMediaMode,
    addLog,
  ]);

  const {
    pullDistance,
    phase: pullPhase,
    progress: pullProgress,
    isPulling,
    isArmed: isPullArmed,
    isRefreshing: isPullRefreshing,
    hapticPulseCount,
  } = usePullToRefresh({
    onRefresh: refreshHomeFeeds,
    disabled: isRestoringScroll || profileOpen || profileSheetOpen || discoveryModalOpen,
  });

  const pullIndicatorVisible = pullPhase !== 'idle';
  const pullIndicatorScale = computePullIndicatorScale(pullProgress, isPullArmed);

  const anilistUserId = state.profiles.anilist?.id;
  useEffect(() => {
    if (
      state.primaryTracker !== 'anilist' ||
      !state.anilistToken ||
      !anilistUserId
    ) {
      setCloudContinueFeeds({});
      return;
    }

    const continueSections = visibleSections.filter((s) => s.type === 'continueMedia');
    if (continueSections.length === 0) return;

    let cancelled = false;
    continueSections.forEach((sec) => {
      const targetType: MediaType = sec.targetMediaType || 'ANIME';
      setCloudContinueFeeds((prev) => ({
        ...prev,
        [sec.id]: { items: prev[sec.id]?.items || [], loading: true, error: null },
      }));
      fetchAniListUserLibrary(state.anilistToken!, anilistUserId, targetType, 'CURRENT')
        .then((items) => {
          if (!cancelled) {
            setCloudContinueFeeds((prev) => ({
              ...prev,
              [sec.id]: { items, loading: false, error: null },
            }));
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setCloudContinueFeeds((prev) => ({
              ...prev,
              [sec.id]: {
                items: prev[sec.id]?.items || [],
                loading: false,
                error: err instanceof Error ? err.message : 'Failed to sync history',
              },
            }));
          }
        });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.primaryTracker, state.anilistToken, anilistUserId, state.homeSections, homeMediaMode]);

  // If user has no discovery section enabled on Home for the selected media mode, fetch trending feed for Hero Banner
  useEffect(() => {
    if (firstDiscoverySection) return;
    let cancelled = false;
    setFallbackHeroFeed((prev) => ({ ...prev, loading: true, error: null }));
    fetchDiscoveryCategory(
      effectiveMetadataTracker,
      'trending',
      homeMediaMode,
      state.contentPrefs.adultContentMode,
      1,
    )
      .then((res) => {
        if (!cancelled) {
          setFallbackHeroFeed({ items: res.items, loading: false, error: null });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setFallbackHeroFeed({
            items: [],
            loading: false,
            error: err instanceof Error ? err.message : 'Failed to load hero feed',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    firstDiscoverySection,
    homeMediaMode,
    effectiveMetadataTracker,
    state.contentPrefs.adultContentMode,
  ]);

  const openDetails = (media: UnifiedMedia) => {
    navigate(`/details/${media.type.toLowerCase()}/${media.id}`, { state: { media } });
  };

  const handleWatchNow = (media: UnifiedMedia) => {
    if (media.type === 'MANGA' || media.type === 'NOVEL') {
      const chCount = Math.min(media.chapters || 12, 24);
      const chapters = Array.from({ length: chCount }, (_, i) => ({
        id: `${media.id}-ch-${i + 1}`,
        number: i + 1,
        title: `Chapter ${i + 1}`,
      }));
      navigate('/reader', {
        state: {
          media,
          chapters,
          chapterIndex: 0,
        },
      });
      return;
    }
    navigate(`/details/${media.type.toLowerCase()}/${media.id}`, {
      state: {
        media,
        initialTab: 'watch',
      },
    });
  };

  const renderModeContent = (mode: HomeMediaMode, isExitingLayer: boolean) => {
    const modeSections = filterHomeSectionsByMediaMode(activeSections, mode);
    const modeFirstDiscovery = modeSections.find((s) => s.type === 'discovery');
    const modeHeroFeed = modeFirstDiscovery
      ? feeds[modeFirstDiscovery.id] || { items: [], loading: true, error: null }
      : fallbackHeroFeed;

    return (
      <>
        <HeroBannerCarousel
          items={modeHeroFeed.items}
          loading={modeHeroFeed.loading}
          paused={isExitingLayer}
          onSelectMedia={openDetails}
          onWatchNow={handleWatchNow}
        />

        {modeSections.length === 0 ? (
          <div className="mx-4 sm:mx-6 py-16 text-center rounded-[var(--sx-radius)] bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] space-y-3">
            <p className="text-base font-bold">
              No active {mode === 'MANGA' ? 'Manga' : 'Anime'} Home sections
            </p>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">
              Customize your Home feed sections in Settings.
            </p>
            <button
              type="button"
              onClick={() => navigate('/settings/home')}
              className="px-4 py-2 rounded-xl bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-xs font-bold"
            >
              Configure Home Layout
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {modeSections.map((section, sectionIdx) => {
              if (section.type === 'continueMedia') {
                const targetType = section.targetMediaType || 'ANIME';
                const isManga = targetType === 'MANGA' || targetType === 'NOVEL';
                const continueStyle = isManga
                  ? state.uiPrefs.continueReadingStyle
                  : state.uiPrefs.continueWatchingStyle;
                const cloudFeed = cloudContinueFeeds[section.id];
                const items = mergeContinueHistoryItems(
                  state.history,
                  cloudFeed?.items ?? [],
                  isManga,
                );
                const isContinueLoading = Boolean(cloudFeed?.loading) && items.length === 0;

                if (!isContinueLoading && items.length === 0) return null;

                return (
                  <ScrollReveal key={section.id} index={sectionIdx} disabled={isExitingLayer}>
                    <HorizontalSection
                      title={section.title}
                      loading={isContinueLoading}
                      cardStyle={continueStyle}
                      onMoreTap={() => navigate(`/continue/${targetType.toLowerCase()}`)}
                    >
                    {items.map((item, idx) => {
                      const label =
                        continueStyle === 'episodeTile'
                          ? formatContinueStepLabel(
                              isManga,
                              isManga ? item.chapterNumber : item.episodeNumber,
                            )
                          : isManga
                            ? `Ch ${item.chapterNumber ?? 1} · P.${(item.pageIndex ?? 0) + 1}`
                            : `Ep ${item.episodeNumber ?? 1}`;
                      const remaining = formatRemainingLabel({
                        isManga,
                        positionSeconds: item.positionSeconds,
                        durationSeconds: item.durationSeconds,
                        pageIndex: item.pageIndex,
                        totalPages: item.totalPages,
                        defaultDurationMinutes: item.media.duration ?? undefined,
                      });
                      const pct =
                        isManga && item.totalPages
                          ? ((item.pageIndex ?? 0) + 1) / item.totalPages
                          : item.durationSeconds
                            ? (item.positionSeconds ?? 0) / item.durationSeconds
                            : 0.35;
                      const isLocal = !item.id.startsWith('cloud-');

                      return (
                        <MediaCard
                          key={item.id}
                          media={item.media}
                          style={continueStyle}
                          progressLabel={label}
                          progressPercent={pct}
                          subtitleRight={remaining}
                          animationIndex={
                            isExitingLayer || modeTransition.transitionId > 0 ? undefined : idx
                          }
                          onRemove={isLocal ? () => removeHistoryItem(item.id) : undefined}
                          onClick={() => openDetails(item.media)}
                        />
                      );
                    })}
                    </HorizontalSection>
                  </ScrollReveal>
                );
              }

              if (section.type === 'libraryStatus') {
                const status = section.libraryStatus || 'CURRENT';
                const targetType = section.targetMediaType || 'ANIME';
                const libItems = state.library.filter(
                  (l) => l.status === status && l.mediaType === targetType,
                );
                if (libItems.length === 0) return null;

                return (
                  <ScrollReveal key={section.id} index={sectionIdx} disabled={isExitingLayer}>
                    <HorizontalSection
                      title={section.title}
                      onMoreTap={() => navigate('/library')}
                    >
                      {libItems.map((entry, idx) => (
                        <MediaCard
                          key={entry.mediaId}
                          media={entry.media}
                          animationIndex={
                            isExitingLayer || modeTransition.transitionId > 0 ? undefined : idx
                          }
                          progressLabel={`${entry.mediaType === 'MANGA' ? 'Ch' : 'Ep'} ${entry.progress}`}
                          onClick={() => openDetails(entry.media)}
                        />
                      ))}
                    </HorizontalSection>
                  </ScrollReveal>
                );
              }

              const feed = feeds[section.id] || { items: [], loading: true, error: null };
              const isTrendingRow = isTrendingDiscoveryRow(section);
              const isEagerSection = shouldEagerLoadSection(
                section.id,
                modeFirstDiscovery?.id,
              );
              const sectionFetchKey = getSectionFetchKey(
                section.id,
                effectiveMetadataTracker,
                state.contentPrefs.adultContentMode,
              );

              const horizontalRow = (
                <HorizontalSection
                  title={section.title}
                  loading={feed.loading}
                  error={feed.error}
                  onRetry={() => {
                    clearSectionFetchKey(sectionFetchKey, triggeredKeysRef.current);
                    triggerSectionLoad(section);
                  }}
                  isEmpty={!feed.loading && !feed.error && feed.items.length === 0}
                  cardStyle={isTrendingRow ? 'trendingRank' : undefined}
                  onMoreTap={() =>
                    navigate(
                      `/discover?type=${section.targetMediaType || 'ANIME'}&category=${encodeURIComponent(section.title)}&sort=${
                        section.trackerCategory === 'topRated'
                          ? 'SCORE_DESC'
                          : section.trackerCategory === 'popular'
                            ? 'POPULARITY_DESC'
                            : 'TRENDING_DESC'
                      }`,
                    )
                  }
                >
                  {feed.items.map((media, idx) => (
                    <MediaCard
                      key={`${section.id}-${media.id}`}
                      media={media}
                      style={isTrendingRow ? 'trendingRank' : undefined}
                      rank={isTrendingRow ? idx + 1 : undefined}
                      animationIndex={
                        isExitingLayer || modeTransition.transitionId > 0 ? undefined : idx
                      }
                      onClick={() => openDetails(media)}
                    />
                  ))}
                </HorizontalSection>
              );

              if (isExitingLayer) {
                return <div key={section.id}>{horizontalRow}</div>;
              }

              return (
                <ScrollReveal key={section.id} index={sectionIdx} disabled={isExitingLayer}>
                  <LazySection
                    sectionId={section.id}
                    eager={isEagerSection}
                    resetKey={loadResetKey}
                    onVisible={() => triggerSectionLoad(section)}
                  >
                    {horizontalRow}
                  </LazySection>
                </ScrollReveal>
              );
            })}
          </div>
        )}
      </>
    );
  };

  return (
    <div
      data-testid="home-page"
      data-restoring-scroll={isRestoringScroll ? 'true' : 'false'}
      data-pull-phase={pullPhase}
      className="relative min-h-screen"
    >
      {/* iOS Spring Pull-to-Refresh Capsule Indicator */}
      <div
        aria-live="polite"
        aria-hidden={!pullIndicatorVisible}
        data-testid="home-pull-refresh-indicator"
        data-refresh-phase={pullPhase}
        data-haptic-pulses={hapticPulseCount}
        style={{
          transform: pullIndicatorVisible
            ? `translate3d(-50%, ${Math.max(4, Math.min(26, pullDistance * 0.28))}px, 0) scale(${pullIndicatorScale})`
            : 'translate3d(-50%, -32px, 0) scale(0.75)',
        }}
        className={`sx-pull-pill-spring pointer-events-none fixed top-[max(0.75rem,env(safe-area-inset-top))] left-1/2 z-50 flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-extrabold backdrop-blur-2xl shadow-[0_14px_34px_-10px_rgba(0,0,0,0.45)] ${
          pullIndicatorVisible ? 'opacity-100' : 'opacity-0'
        } ${
          isPullArmed || isPullRefreshing
            ? 'border-[var(--sx-primary)]/50 bg-[var(--sx-surface-container)]/92 text-[var(--sx-on-surface)]'
            : pullPhase === 'completing'
              ? 'border-emerald-500/45 bg-[var(--sx-surface-container)]/92 text-emerald-400'
              : 'border-[var(--sx-outline)] bg-[var(--sx-surface-container)]/85 text-[var(--sx-on-surface-muted)]'
        }`}
      >
        <span
          key={
            pullPhase === 'completing'
              ? 'pull-done'
              : isPullArmed
                ? 'pull-armed'
                : 'pull-icon'
          }
          className={`flex h-5 w-5 items-center justify-center rounded-full ${
            pullPhase === 'completing'
              ? 'sx-pull-haptic-pop bg-emerald-500/15 text-emerald-400'
              : isPullArmed
                ? 'sx-pull-haptic-pop bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                : isPullRefreshing
                  ? 'bg-[var(--sx-primary)]/15 text-[var(--sx-primary)]'
                  : 'bg-[var(--sx-surface-high)] text-[var(--sx-on-surface)]'
          }`}
        >
          {pullPhase === 'completing' ? (
            <Check className="h-3.5 w-3.5" />
          ) : isPullRefreshing ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowDown
              style={{
                transform: `rotate(${isPullArmed ? 180 : Math.round(pullProgress * 165)}deg)`,
                transition: 'transform 220ms var(--sx-ease-bounce)',
              }}
              className="h-3.5 w-3.5"
            />
          )}
        </span>

        <span className="whitespace-nowrap tracking-tight">
          {pullPhase === 'completing'
            ? 'Updated'
            : isPullRefreshing
              ? 'Refreshing...'
              : isPullArmed
                ? 'Release to refresh'
                : 'Pull to refresh'}
        </span>
      </div>

      {/* Spring-Displaced Content Stage */}
      <div
        style={
          pullDistance > 0
            ? {
                transform: `translate3d(0, ${pullDistance}px, 0)`,
              }
            : undefined
        }
        className={`space-y-7 pb-10 ${isPulling ? '' : 'sx-pull-content-spring'}`}
      >
      <HomeHeader
        onOpenProfile={() =>
          shouldOpenProfileSheet(state.uiPrefs.homeHeaderStyle)
            ? setProfileSheetOpen(true)
            : setProfileOpen(true)
        }
        onOpenDiscoveryMode={() => setDiscoveryModalOpen(true)}
      />

      {outageTracker && (
        <div className="mx-4 sm:mx-6 p-3.5 rounded-[var(--sx-radius)] bg-red-500/10 border border-red-500/30 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <div>
              <p className="text-sm font-bold text-[var(--sx-on-surface)]">
                {outageTracker.toUpperCase()} service is unreachable
              </p>
              <p className="text-xs text-[var(--sx-on-surface-muted)]">
                Switch discovery source to MyAnimeList or Kitsu to keep browsing.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => updateDiscoveryPrefs({ metadataTrackerId: 'myanimelist' })}
              className="px-3 py-1.5 rounded-lg bg-[var(--sx-surface-high)] text-xs font-bold hover:bg-[var(--sx-primary)] hover:text-[var(--sx-on-primary)] transition-colors"
            >
              Use MAL
            </button>
            <button
              type="button"
              onClick={() => updateDiscoveryPrefs({ metadataTrackerId: 'kitsu' })}
              className="px-3 py-1.5 rounded-lg bg-[var(--sx-surface-high)] text-xs font-bold hover:bg-[var(--sx-primary)] hover:text-[var(--sx-on-primary)] transition-colors"
            >
              Use Kitsu
            </button>
          </div>
        </div>
      )}

      {/* Anime / Manga Mode Switcher + Cross-Fading Featured Hero & Sections */}
      <div className="space-y-4">
        <div className="mx-4 sm:mx-6 flex items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Home media type"
            data-testid="home-media-switcher"
            style={{ borderRadius: 'var(--sx-radius)' }}
            className="relative grid grid-cols-2 items-center p-1 bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] shadow-sm"
          >
            <span
              aria-hidden="true"
              style={{ borderRadius: 'calc(var(--sx-radius) - 4px)' }}
              className={`pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] bg-[var(--sx-primary)] shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                homeMediaMode === 'MANGA' ? 'translate-x-full' : 'translate-x-0'
              }`}
            />
            <button
              type="button"
              role="tab"
              aria-selected={homeMediaMode === 'ANIME'}
              data-testid="home-mode-anime"
              onClick={() => handleSelectMediaMode('ANIME')}
              style={{ borderRadius: 'calc(var(--sx-radius) - 4px)' }}
              className={`relative z-10 inline-flex items-center justify-center gap-2 px-4 py-1.5 text-xs sm:text-sm font-bold transition-colors duration-200 ${
                homeMediaMode === 'ANIME'
                  ? 'text-[var(--sx-on-primary)]'
                  : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
              }`}
            >
              <Tv className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Anime</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={homeMediaMode === 'MANGA'}
              data-testid="home-mode-manga"
              onClick={() => handleSelectMediaMode('MANGA')}
              style={{ borderRadius: 'calc(var(--sx-radius) - 4px)' }}
              className={`relative z-10 inline-flex items-center justify-center gap-2 px-4 py-1.5 text-xs sm:text-sm font-bold transition-colors duration-200 ${
                homeMediaMode === 'MANGA'
                  ? 'text-[var(--sx-on-primary)]'
                  : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Manga</span>
            </button>
          </div>
        </div>

        <div
          className="relative overflow-x-clip"
          data-testid="home-mode-stage"
          data-media-mode={modeTransition.activeMode}
          data-transitioning={modeTransition.isTransitioning ? 'true' : 'false'}
        >
          {modeTransition.isTransitioning && modeTransition.exitingMode && (
            <div
              key={`exit-${modeTransition.exitingMode}-${modeTransition.transitionId}`}
              aria-hidden="true"
              data-testid="home-mode-exiting-layer"
              className="sx-mode-exit pointer-events-none select-none absolute inset-x-0 top-0 z-0 max-h-full overflow-hidden space-y-7"
            >
              {renderModeContent(modeTransition.exitingMode, true)}
            </div>
          )}

          <div
            key={`active-${modeTransition.activeMode}-${modeTransition.transitionId}`}
            data-testid="home-mode-active-layer"
            className={`relative z-10 space-y-7 ${
              modeTransition.transitionId > 0 ? 'sx-mode-enter' : ''
            }`}
          >
            {renderModeContent(modeTransition.activeMode, false)}
          </div>
        </div>
      </div>

      <ProfileSheetModal
        open={profileSheetOpen}
        onClose={() => setProfileSheetOpen(false)}
        onOpenLogin={() => {
          setProfileSheetOpen(false);
          setProfileOpen(true);
        }}
        onOpenServicePicker={() => {
          setProfileSheetOpen(false);
          setDiscoveryModalOpen(true);
        }}
      />
      <TrackerProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      <DiscoveryModeModal
        open={discoveryModalOpen}
        onClose={() => setDiscoveryModalOpen(false)}
      />
      </div>
    </div>
  );
};
