import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  SlidersHorizontal,
  X,
  RotateCcw,
  Puzzle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import {
  MediaType,
  SearchFormatFilter,
  SearchSort,
  SearchStatusFilter,
  UnifiedMedia,
} from '../types/media';
import {
  fetchDiscoveryGenresAndTags,
  searchDiscoveryMedia,
} from '../services/discoveryService';
import { MediaCard } from '../components/MediaCard';
import { MediaCardSkeleton } from '../components/MediaCardSkeleton';
import { getMediaGridClassName } from '../utils/mediaCard';
import { useSlidingPill } from '../hooks/useSlidingPill';
import { getBoundedStaggerDelay } from '../utils/appMotion';

const TILE_GRADIENTS = [
  'from-red-600/85 to-orange-500/75',
  'from-purple-600/85 to-fuchsia-500/75',
  'from-blue-600/85 to-sky-500/75',
  'from-teal-600/85 to-emerald-500/75',
  'from-indigo-600/85 to-violet-500/75',
  'from-pink-600/85 to-rose-500/75',
  'from-amber-600/85 to-yellow-500/75',
  'from-cyan-600/85 to-blue-500/75',
];

export const DiscoverPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state, effectiveMetadataTracker, allSources, toggleSourceActive } = useApp();

  const [queryInput, setQueryInput] = useState(searchParams.get('query') || '');
  const [debouncedQuery, setDebouncedQuery] = useState(searchParams.get('query') || '');
  const [mediaType, setMediaType] = useState<MediaType>(() => {
    const t = searchParams.get('type')?.toUpperCase();
    return t === 'MANGA' || t === 'NOVEL' ? (t as MediaType) : 'ANIME';
  });
  const [selectedGenres, setSelectedGenres] = useState<string[]>(() => {
    const g = searchParams.get('genres');
    return g ? g.split(',').filter(Boolean) : [];
  });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sort, setSort] = useState<SearchSort>(
    (searchParams.get('sort') as SearchSort) || 'POPULARITY_DESC',
  );
  const [status, setStatus] = useState<SearchStatusFilter>('ALL');
  const [format, setFormat] = useState<SearchFormatFilter>('ALL');
  const [categoryTitle] = useState<string | null>(searchParams.get('category'));

  const [browseTab, setBrowseTab] = useState<'genres' | 'tags'>('genres');
  const [genresList, setGenresList] = useState<string[]>([]);
  const [tagsList, setTagsList] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);

  const [results, setResults] = useState<UnifiedMedia[]>([]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(queryInput.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [queryInput]);

  // Load genres and tags
  useEffect(() => {
    fetchDiscoveryGenresAndTags().then(({ genres, tags }) => {
      setGenresList(genres);
      setTagsList(tags);
    });
  }, []);

  const hasActiveFilters =
    selectedGenres.length > 0 ||
    selectedTags.length > 0 ||
    sort !== 'POPULARITY_DESC' ||
    status !== 'ALL' ||
    format !== 'ALL';

  const isSearching =
    debouncedQuery.length > 0 || hasActiveFilters || Boolean(categoryTitle);

  const runSearch = useCallback(
    async (pageNum: number, append: boolean) => {
      if (!isSearching) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const res = await searchDiscoveryMedia(effectiveMetadataTracker, {
          query: debouncedQuery || undefined,
          type: mediaType,
          page: pageNum,
          genres: selectedGenres,
          tags: selectedTags,
          sort,
          status,
          format,
          adultMode: state.contentPrefs.adultContentMode,
        });
        setResults((prev) => (append ? [...prev, ...res.items] : res.items));
        setHasNextPage(res.hasNextPage);
        setPage(pageNum);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [
      isSearching,
      effectiveMetadataTracker,
      debouncedQuery,
      mediaType,
      selectedGenres,
      selectedTags,
      sort,
      status,
      format,
      state.contentPrefs.adultContentMode,
    ],
  );

  useEffect(() => {
    if (isSearching) {
      void runSearch(1, false);
    } else {
      setResults([]);
    }
  }, [isSearching, runSearch]);

  const clearAll = () => {
    setQueryInput('');
    setDebouncedQuery('');
    setSelectedGenres([]);
    setSelectedTags([]);
    setSort('POPULARITY_DESC');
    setStatus('ALL');
    setFormat('ALL');
  };

  const isTrackerMode = state.discoveryPrefs.mode === 'tracker';
  const mediaTypePill = useSlidingPill<HTMLDivElement>(mediaType);
  const browseTabPill = useSlidingPill<HTMLDivElement>(browseTab, `${isSearching}-${isTrackerMode}`);

  return (
    <div className="min-h-screen px-4 sm:px-6 pt-5 pb-12 space-y-5">
      {/* Top Search Bar + Media Type Switcher */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-2xl">
          <Search className="w-4 h-4 text-[var(--sx-on-surface-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder={
              categoryTitle
                ? `Search in ${categoryTitle}...`
                : `Search ${mediaType.toLowerCase()} on ${effectiveMetadataTracker}...`
            }
            className="w-full pl-10 pr-20 py-3 rounded-[var(--sx-radius)] bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] text-sm font-medium focus:outline-none focus:border-[var(--sx-primary)] transition-colors"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {(queryInput || hasActiveFilters) && (
              <button
                type="button"
                onClick={clearAll}
                title="Clear search & filters"
                className="p-1.5 rounded-lg text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] hover:bg-[var(--sx-surface-high)]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setFilterOpen(true)}
              title="Advanced Filters"
              className={`p-1.5 rounded-lg transition-colors ${
                hasActiveFilters
                  ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                  : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] hover:bg-[var(--sx-surface-high)]'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Media Switcher matching MediaSwitcherOverlay */}
        <div
          ref={mediaTypePill.containerRef}
          className="relative flex items-center gap-1 p-1 rounded-[var(--sx-radius)] bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] self-start sm:self-auto"
        >
          {mediaTypePill.pillRect.ready && (
            <span
              aria-hidden="true"
              style={{
                transform: `translate3d(${mediaTypePill.pillRect.left}px, ${mediaTypePill.pillRect.top}px, 0)`,
                width: `${mediaTypePill.pillRect.width}px`,
                height: `${mediaTypePill.pillRect.height}px`,
              }}
              className="sx-pill-glide pointer-events-none absolute left-0 top-0 rounded-[calc(var(--sx-radius)-4px)] bg-[var(--sx-primary)] shadow-sm"
            />
          )}
          {(['ANIME', 'MANGA', 'NOVEL'] as MediaType[]).map((t) => (
            <button
              key={t}
              ref={mediaTypePill.registerItemRef(t)}
              type="button"
              onClick={() => setMediaType(t)}
              className={`relative z-10 px-3.5 py-1.5 rounded-[calc(var(--sx-radius)-4px)] text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                mediaType === t
                  ? mediaTypePill.pillRect.ready
                    ? 'text-[var(--sx-on-primary)]'
                    : 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                  : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
              }`}
            >
              {t === 'ANIME' ? 'Anime' : t === 'MANGA' ? 'Manga' : 'Novel'}
            </button>
          ))}
        </div>
      </div>

      {/* Active Filter Summary */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {selectedGenres.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setSelectedGenres((prev) => prev.filter((x) => x !== g))}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--sx-primary-container)]/40 border border-[var(--sx-primary)]/40 font-semibold"
            >
              <span>{g}</span>
              <X className="w-3 h-3" />
            </button>
          ))}
          {selectedTags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setSelectedTags((prev) => prev.filter((x) => x !== t))}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] font-semibold"
            >
              <span>#{t}</span>
              <X className="w-3 h-3" />
            </button>
          ))}
          {status !== 'ALL' && (
            <span className="text-[var(--sx-on-surface-muted)] font-semibold">
              Status: {status}
            </span>
          )}
          {format !== 'ALL' && (
            <span className="text-[var(--sx-on-surface-muted)] font-semibold">
              Format: {format}
            </span>
          )}
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 text-[var(--sx-primary)] font-bold ml-1 hover:underline"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>
      )}

      {/* Results OR Browse Genres/Sources */}
      {!isSearching ? (
        isTrackerMode ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold">
                {browseTab === 'genres' ? 'Browse Genres' : 'Browse Tags'}
              </h2>
              <div
                ref={browseTabPill.containerRef}
                className="relative flex items-center gap-1 p-1 rounded-lg bg-[var(--sx-surface-container)] border border-[var(--sx-outline)]"
              >
                {browseTabPill.pillRect.ready && (
                  <span
                    aria-hidden="true"
                    style={{
                      transform: `translate3d(${browseTabPill.pillRect.left}px, ${browseTabPill.pillRect.top}px, 0)`,
                      width: `${browseTabPill.pillRect.width}px`,
                      height: `${browseTabPill.pillRect.height}px`,
                    }}
                    className="sx-pill-glide pointer-events-none absolute left-0 top-0 rounded-md bg-[var(--sx-primary)] shadow-sm"
                  />
                )}
                <button
                  ref={browseTabPill.registerItemRef('genres')}
                  type="button"
                  onClick={() => setBrowseTab('genres')}
                  className={`relative z-10 px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                    browseTab === 'genres'
                      ? browseTabPill.pillRect.ready
                        ? 'text-[var(--sx-on-primary)]'
                        : 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                      : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                  }`}
                >
                  Genres ({genresList.length})
                </button>
                <button
                  ref={browseTabPill.registerItemRef('tags')}
                  type="button"
                  onClick={() => setBrowseTab('tags')}
                  className={`relative z-10 px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                    browseTab === 'tags'
                      ? browseTabPill.pillRect.ready
                        ? 'text-[var(--sx-on-primary)]'
                        : 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                      : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                  }`}
                >
                  Tags ({tagsList.length})
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {(browseTab === 'genres' ? genresList : tagsList).map((name, idx) => {
                const gradient = TILE_GRADIENTS[idx % TILE_GRADIENTS.length];
                return (
                  <button
                    key={`${browseTab}-${name}`}
                    type="button"
                    onClick={() => {
                      if (browseTab === 'genres') setSelectedGenres([name]);
                      else setSelectedTags([name]);
                    }}
                    style={{
                      borderRadius: `${state.themePrefs.uiRoundness}px`,
                      animationDelay: `${getBoundedStaggerDelay(idx, 16, 12)}ms`,
                    }}
                    className={`sx-card-animate relative h-24 p-4 text-left overflow-hidden bg-gradient-to-br ${gradient} text-white shadow-sm hover:-translate-y-0.5 transition-transform flex flex-col justify-end`}
                  >
                    <span className="text-sm font-extrabold tracking-tight drop-shadow-sm line-clamp-2">
                      {name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold">Available Sources</h2>
              <button
                type="button"
                onClick={() => navigate('/settings/extensions')}
                className="text-xs font-bold text-[var(--sx-primary)] hover:underline"
              >
                Manage Extensions
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {allSources
                .filter((s) => s.mediaTypes.includes(mediaType))
                .map((src) => {
                  const active = state.discoveryPrefs.activeSources.includes(src.id);
                  return (
                    <button
                      key={src.id}
                      type="button"
                      onClick={() => toggleSourceActive(src.id)}
                      className={`p-4 rounded-[var(--sx-radius)] border text-left transition-colors flex items-start justify-between gap-3 ${
                        active
                          ? 'bg-[var(--sx-primary-container)]/25 border-[var(--sx-primary)]'
                          : 'bg-[var(--sx-surface-container)] border-[var(--sx-outline)]'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Puzzle className="w-4 h-4 text-[var(--sx-primary)]" />
                          <span className="text-sm font-bold">{src.name}</span>
                        </div>
                        <p className="text-xs text-[var(--sx-on-surface-muted)]">
                          {src.description}
                        </p>
                      </div>
                      {active && <CheckCircle2 className="w-4 h-4 text-[var(--sx-primary)] shrink-0" />}
                    </button>
                  );
                })}
            </div>
          </div>
        )
      ) : loading ? (
        <div className={getMediaGridClassName(state.uiPrefs.cardStyle)}>
          {Array.from({ length: 12 }).map((_, i) => (
            <MediaCardSkeleton key={i} style={state.uiPrefs.cardStyle} fullWidth />
          ))}
        </div>
      ) : error ? (
        <div className="p-8 rounded-[var(--sx-radius)] bg-[var(--sx-surface-container)] border border-red-500/30 text-center space-y-3">
          <p className="text-sm font-bold text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => runSearch(1, false)}
            className="px-4 py-2 rounded-xl bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-xs font-bold"
          >
            Retry Search
          </button>
        </div>
      ) : results.length === 0 ? (
        <div className="py-16 text-center space-y-2">
          <p className="text-base font-bold">No results found</p>
          <p className="text-xs text-[var(--sx-on-surface-muted)]">
            Try adjusting your query or clearing active filters.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className={getMediaGridClassName(state.uiPrefs.cardStyle)}>
            {results.map((media, idx) => (
              <MediaCard
                key={`${media.id}-${media.type}-${idx}`}
                media={media}
                fullWidth
                animationIndex={idx}
                onClick={() =>
                  navigate(`/details/${media.type.toLowerCase()}/${media.id}`, {
                    state: { media },
                  })
                }
              />
            ))}
          </div>
          {hasNextPage && (
            <div className="flex justify-center pt-4">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => runSearch(page + 1, true)}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] text-xs font-bold hover:border-[var(--sx-primary)] transition-colors"
              >
                {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{loadingMore ? 'Loading more...' : 'Load More Results'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Advanced Search Sheet Modal */}
      {filterOpen &&
        (() => {
          const modalContent = (
            <div
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4 sx-backdrop-enter"
              onClick={() => setFilterOpen(false)}
              role="dialog"
              aria-modal="true"
              aria-label="Advanced Search Filters"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full sm:max-w-xl max-h-[85vh] overflow-y-auto bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] rounded-t-2xl sm:rounded-2xl p-5 space-y-5 shadow-2xl sx-sheet-enter"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-extrabold">Advanced Search Filters</h2>
                  <button
                    type="button"
                    onClick={() => setFilterOpen(false)}
                    className="p-2 rounded-lg hover:bg-[var(--sx-surface-high)]"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--sx-on-surface-muted)]">
                      Sort By
                    </label>
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value as SearchSort)}
                      className="w-full px-3 py-2 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-xs font-semibold"
                    >
                      <option value="POPULARITY_DESC">Popularity</option>
                      <option value="TRENDING_DESC">Trending</option>
                      <option value="SCORE_DESC">Highest Score</option>
                      <option value="FAVOURITES_DESC">Favourites</option>
                      <option value="START_DATE_DESC">Newest</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--sx-on-surface-muted)]">
                      Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as SearchStatusFilter)}
                      className="w-full px-3 py-2 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-xs font-semibold"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="RELEASING">Releasing</option>
                      <option value="FINISHED">Finished</option>
                      <option value="NOT_YET_RELEASED">Upcoming</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--sx-on-surface-muted)]">
                      Format
                    </label>
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value as SearchFormatFilter)}
                      className="w-full px-3 py-2 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-xs font-semibold"
                    >
                      <option value="ALL">All Formats</option>
                      <option value="TV">TV</option>
                      <option value="MOVIE">Movie</option>
                      <option value="OVA">OVA</option>
                      <option value="ONA">ONA</option>
                      <option value="MANGA">Manga</option>
                      <option value="NOVEL">Light Novel</option>
                      <option value="ONE_SHOT">One Shot</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-[var(--sx-on-surface-muted)]">
                    Genres
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {genresList.map((g) => {
                      const active = selectedGenres.includes(g);
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() =>
                            setSelectedGenres((prev) =>
                              active ? prev.filter((x) => x !== g) : [...prev, g],
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                            active
                              ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] border-[var(--sx-primary)]'
                              : 'bg-[var(--sx-surface-high)] border-[var(--sx-outline)]'
                          }`}
                        >
                          {g}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--sx-outline)]">
                  <button
                    type="button"
                    onClick={clearAll}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterOpen(false)}
                    className="px-5 py-2 rounded-xl bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-xs font-bold"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>
            </div>
          );
          return typeof document !== 'undefined'
            ? createPortal(modalContent, document.body)
            : modalContent;
        })()}
    </div>
  );
};
