import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cloud, Folder, Search, RefreshCw } from 'lucide-react';
import { useApp } from '../store/AppContext';
import {
  getPreferredTitle,
  getStatusLabel,
  LibraryEntry,
  MediaType,
  TrackedStatus,
} from '../types/media';
import { fetchAniListUserLibrary } from '../services/anilist';
import { MediaCard } from '../components/MediaCard';
import { MediaCardSkeleton } from '../components/MediaCardSkeleton';
import { getMediaGridClassName } from '../utils/mediaCard';
import { useSlidingPill } from '../hooks/useSlidingPill';

const STATUS_TABS: TrackedStatus[] = [
  'CURRENT',
  'PLANNING',
  'COMPLETED',
  'PAUSED',
  'DROPPED',
  'REPEATING',
];

export const LibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useApp();
  const [mediaType, setMediaType] = useState<MediaType>('ANIME');
  const [status, setStatus] = useState<TrackedStatus>('CURRENT');
  const [mode, setMode] = useState<'local' | 'cloud'>(
    state.anilistToken && state.primaryTracker === 'anilist' ? 'cloud' : 'local',
  );
  const [filterQuery, setFilterQuery] = useState('');
  const [cloudItems, setCloudItems] = useState<LibraryEntry[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

  const loadCloud = async () => {
    const anilistProfile = state.profiles.anilist;
    if (!state.anilistToken || !anilistProfile?.id) return;
    setLoadingCloud(true);
    setCloudError(null);
    try {
      const items = await fetchAniListUserLibrary(
        state.anilistToken,
        anilistProfile.id,
        mediaType,
        status,
      );
      setCloudItems(items);
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : 'Failed to sync cloud library');
    } finally {
      setLoadingCloud(false);
    }
  };

  useEffect(() => {
    if (mode === 'cloud' && state.anilistToken) {
      void loadCloud();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, mediaType, status, state.anilistToken]);

  const rawEntries =
    mode === 'cloud'
      ? cloudItems
      : state.library.filter((l) => l.mediaType === mediaType && l.status === status);

  const filteredEntries = rawEntries.filter((e) => {
    if (!filterQuery.trim()) return true;
    const t = getPreferredTitle(e.media.title, state.contentPrefs.titlePreference).toLowerCase();
    return t.includes(filterQuery.toLowerCase());
  });

  const modePill = useSlidingPill<HTMLDivElement>(mode, Boolean(state.anilistToken));
  const mediaTypePill = useSlidingPill<HTMLDivElement>(mediaType);

  return (
    <div className="min-h-screen px-4 sm:px-6 pt-5 pb-12 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">
            {getStatusLabel(status, mediaType)}
          </h1>
          <p className="text-xs text-[var(--sx-on-surface-muted)]">
            {mode === 'cloud' ? 'Synced from AniList Cloud' : 'Stored in Local Library'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {state.anilistToken && (
            <div
              ref={modePill.containerRef}
              className="relative flex items-center gap-1 p-1 rounded-xl bg-[var(--sx-surface-container)] border border-[var(--sx-outline)]"
            >
              {modePill.pillRect.ready && (
                <span
                  aria-hidden="true"
                  style={{
                    transform: `translate3d(${modePill.pillRect.left}px, ${modePill.pillRect.top}px, 0)`,
                    width: `${modePill.pillRect.width}px`,
                    height: `${modePill.pillRect.height}px`,
                  }}
                  className="sx-pill-glide pointer-events-none absolute left-0 top-0 rounded-lg bg-[var(--sx-primary)] shadow-sm"
                />
              )}
              <button
                ref={modePill.registerItemRef('cloud')}
                type="button"
                onClick={() => setMode('cloud')}
                className={`relative z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  mode === 'cloud'
                    ? modePill.pillRect.ready
                      ? 'text-[var(--sx-on-primary)]'
                      : 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                    : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                }`}
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>Cloud</span>
              </button>
              <button
                ref={modePill.registerItemRef('local')}
                type="button"
                onClick={() => setMode('local')}
                className={`relative z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  mode === 'local'
                    ? modePill.pillRect.ready
                      ? 'text-[var(--sx-on-primary)]'
                      : 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                    : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                }`}
              >
                <Folder className="w-3.5 h-3.5" />
                <span>Local</span>
              </button>
            </div>
          )}

          <div
            ref={mediaTypePill.containerRef}
            className="relative flex items-center gap-1 p-1 rounded-xl bg-[var(--sx-surface-container)] border border-[var(--sx-outline)]"
          >
            {mediaTypePill.pillRect.ready && (
              <span
                aria-hidden="true"
                style={{
                  transform: `translate3d(${mediaTypePill.pillRect.left}px, ${mediaTypePill.pillRect.top}px, 0)`,
                  width: `${mediaTypePill.pillRect.width}px`,
                  height: `${mediaTypePill.pillRect.height}px`,
                }}
                className="sx-pill-glide pointer-events-none absolute left-0 top-0 rounded-lg bg-[var(--sx-primary)] shadow-sm"
              />
            )}
            {(['ANIME', 'MANGA', 'NOVEL'] as MediaType[]).map((t) => (
              <button
                key={t}
                ref={mediaTypePill.registerItemRef(t)}
                type="button"
                onClick={() => setMediaType(t)}
                className={`relative z-10 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
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
      </div>

      {/* Status Filter Tabs + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 border transition-colors ${
                status === s
                  ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] border-[var(--sx-primary)]'
                  : 'bg-[var(--sx-surface-container)] border-[var(--sx-outline)] text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
              }`}
            >
              {getStatusLabel(s, mediaType)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-[var(--sx-on-surface-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter library..."
              className="w-full pl-8 pr-3 py-2 rounded-xl bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] text-xs focus:outline-none focus:border-[var(--sx-primary)]"
            />
          </div>
          {mode === 'cloud' && (
            <button
              type="button"
              onClick={loadCloud}
              className="p-2 rounded-xl bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] hover:border-[var(--sx-primary)]"
              title="Refresh Cloud Library"
            >
              <RefreshCw className={`w-4 h-4 ${loadingCloud ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      {loadingCloud ? (
        <div
          aria-busy="true"
          aria-label="Loading cloud library"
          className={getMediaGridClassName(state.uiPrefs.cardStyle)}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <MediaCardSkeleton key={i} style={state.uiPrefs.cardStyle} fullWidth />
          ))}
        </div>
      ) : cloudError ? (
        <div className="p-6 rounded-[var(--sx-radius)] bg-[var(--sx-surface-container)] border border-red-500/30 text-center text-xs text-red-400">
          {cloudError}
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="py-16 text-center rounded-[var(--sx-radius)] bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] space-y-3">
          <p className="text-base font-bold">Your {getStatusLabel(status, mediaType)} list is empty</p>
          <p className="text-xs text-[var(--sx-on-surface-muted)]">
            Discover {mediaType.toLowerCase()} and add titles to track your progress here.
          </p>
          <button
            type="button"
            onClick={() => navigate(`/discover?type=${mediaType}`)}
            className="px-4 py-2 rounded-xl bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-xs font-bold"
          >
            Explore {mediaType === 'MANGA' ? 'Manga' : 'Anime'}
          </button>
        </div>
      ) : (
        <div className={getMediaGridClassName(state.uiPrefs.cardStyle)}>
          {filteredEntries.map((entry, idx) => {
            const total =
              entry.mediaType === 'MANGA' ? entry.media.chapters : entry.media.episodes;
            const label = `${entry.mediaType === 'MANGA' ? 'Ch' : 'Ep'} ${entry.progress}${
              total ? ` / ${total}` : ''
            }`;
            return (
              <MediaCard
                key={`${entry.mediaId}-${entry.status}`}
                media={entry.media}
                fullWidth
                animationIndex={idx}
                progressLabel={label}
                progressPercent={total ? entry.progress / total : undefined}
                onClick={() =>
                  navigate(`/details/${entry.media.type.toLowerCase()}/${entry.media.id}`, {
                    state: { media: entry.media },
                  })
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
