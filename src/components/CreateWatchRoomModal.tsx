import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Radio, Search, Tv, X } from 'lucide-react';
import { UnifiedEpisode, UnifiedMedia } from '../types/media';
import { useApp } from '../store/AppContext';
import {
  fetchDiscoveryCategory,
  searchDiscoveryMedia,
} from '../services/discoveryService';
import { resolveEpisodesForMedia } from '../services/sourceEngine';
import { SmartImage } from './SmartImage';
import {
  buildDefaultRoomName,
  resolveDefaultDisplayName,
  resolveDefaultHostAvatar,
  WatchPartyTrack,
} from '../utils/watchParty';

export interface CreateWatchRoomPayload {
  media: UnifiedMedia;
  episodes: UnifiedEpisode[];
  episodeIndex: number;
  track: WatchPartyTrack;
  roomName: string;
  isPublic: boolean;
  userName: string;
  hostAvatar?: string;
}

interface CreateWatchRoomModalProps {
  open: boolean;
  initialMedia?: UnifiedMedia | null;
  initialEpisodes?: UnifiedEpisode[];
  initialEpisodeNumber?: number;
  mode?: 'create' | 'change-anime';
  variant?: 'lobby' | 'quick-episode';
  isFullscreen?: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateWatchRoomPayload) => void;
}

export const CreateWatchRoomModal: React.FC<CreateWatchRoomModalProps> = ({
  open,
  initialMedia = null,
  initialEpisodes,
  initialEpisodeNumber = 1,
  mode = 'create',
  variant = 'lobby',
  isFullscreen = false,
  onClose,
  onSubmit,
}) => {
  const { state, effectiveMetadataTracker } = useApp();
  const displayName = resolveDefaultDisplayName(state.profiles);
  const hostAvatar = resolveDefaultHostAvatar(state.profiles);
  const defaultRoomName = buildDefaultRoomName(displayName);
  const tracker = effectiveMetadataTracker;

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UnifiedMedia[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const [selectedAnime, setSelectedAnime] = useState<UnifiedMedia | null>(initialMedia);
  const [episodes, setEpisodes] = useState<UnifiedEpisode[]>(initialEpisodes ?? []);
  const [episodeNumber, setEpisodeNumber] = useState(initialEpisodeNumber || 1);
  const [track, setTrack] = useState<WatchPartyTrack>('H-Sub');
  const [roomNameDraft, setRoomNameDraft] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const initialEpisodeSeedRef = useRef(initialEpisodeNumber || 1);

  useEffect(() => {
    if (!open) return;
    setValidationError(null);
    initialEpisodeSeedRef.current = initialEpisodeNumber || 1;
    if (mode === 'change-anime') {
      setSelectedAnime(null);
      setSearchQuery('');
      setSearchOpen(true);
    } else if (initialMedia) {
      setSelectedAnime(initialMedia);
      setSearchOpen(false);
    }
  }, [open, initialMedia, initialEpisodeNumber, mode]);

  // Load initial popular suggestions or search results when modal is open & no anime chosen
  useEffect(() => {
    if (!open || selectedAnime) return;
    let cancelled = false;
    const trimmed = searchQuery.trim();
    const timer = window.setTimeout(
      async () => {
        setSearching(true);
        try {
          const res = trimmed
            ? await searchDiscoveryMedia(tracker, {
                query: trimmed,
                type: 'ANIME',
                adultMode: state.contentPrefs.adultContentMode,
              })
            : await fetchDiscoveryCategory(
                tracker,
                'trending',
                'ANIME',
                state.contentPrefs.adultContentMode,
                1,
              );
          if (!cancelled) {
            setSearchResults(res.items.slice(0, 10));
          }
        } catch {
          if (!cancelled) {
            setSearchResults([]);
          }
        } finally {
          if (!cancelled) {
            setSearching(false);
          }
        }
      },
      trimmed ? 240 : 0,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, selectedAnime, searchQuery, tracker, state.contentPrefs.adultContentMode]);

  // Resolve episodes when an anime is selected
  useEffect(() => {
    if (!selectedAnime) {
      setEpisodes([]);
      setEpisodeNumber(1);
      return;
    }
    let cancelled = false;
    const targetEp =
      initialMedia && selectedAnime.id === initialMedia.id
        ? Math.max(1, initialEpisodeSeedRef.current)
        : 1;
    if (
      initialMedia &&
      selectedAnime.id === initialMedia.id &&
      initialEpisodes &&
      initialEpisodes.length > 0
    ) {
      setEpisodes(initialEpisodes);
      setEpisodeNumber(targetEp);
      return;
    }

    const fallbackCount = Math.max(targetEp, selectedAnime.episodes || 12);
    const baseList: UnifiedEpisode[] = Array.from({ length: fallbackCount }, (_, idx) => ({
      id: `${selectedAnime.id}-ep-${idx + 1}`,
      number: idx + 1,
      title: `Episode ${idx + 1}`,
      thumbnail: selectedAnime.banner || selectedAnime.cover || null,
    }));
    setEpisodes(baseList);
    setEpisodeNumber(targetEp);

    resolveEpisodesForMedia(selectedAnime)
      .then((resolved) => {
        if (!cancelled && Array.isArray(resolved) && resolved.length > 0) {
          setEpisodes(resolved);
        }
      })
      .catch(() => {
        // Keep generated episode list fallback
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAnime, initialMedia, initialEpisodes]);

  if (!open) return null;

  const handleSelectAnime = (anime: UnifiedMedia) => {
    setSelectedAnime(anime);
    setSearchOpen(false);
    setValidationError(null);
  };

  const handleClearAnime = () => {
    setSelectedAnime(null);
    setSearchQuery('');
    setSearchOpen(true);
    window.setTimeout(() => searchInputRef.current?.focus(), 40);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAnime) {
      setValidationError('Search and pick an anime first.');
      setSearchOpen(true);
      searchInputRef.current?.focus();
      return;
    }
    const epIdx = Math.max(
      0,
      episodes.findIndex((ep) => ep.number === episodeNumber),
    );
    onSubmit({
      media: selectedAnime,
      episodes,
      episodeIndex: epIdx,
      track,
      roomName: roomNameDraft.trim() || defaultRoomName,
      isPublic,
      userName: displayName,
      hostAvatar,
    });
  };

  const isQuickEpisode =
    variant === 'quick-episode' && mode === 'create' && Boolean(initialMedia);
  const activeEpisodeItem =
    episodes.find((ep) => ep.number === episodeNumber) ||
    episodes[Math.max(0, episodeNumber - 1)];

  const animeTitle = selectedAnime
    ? selectedAnime.title.english ||
      selectedAnime.title.romaji ||
      selectedAnime.title.native ||
      'Selected Anime'
    : '';
  const epTotalCount = selectedAnime?.episodes || episodes.length;

  const modalNode = (
    <div
      data-no-gesture="true"
      data-testid="create-watch-room-backdrop"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      className={`sx-backdrop-enter ${
        isFullscreen ? 'absolute inset-0 z-[120]' : 'fixed inset-0 z-[120]'
      } flex items-center justify-center bg-black/60 backdrop-blur-md p-3 sm:p-4`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-room-title"
        data-testid="create-watch-room-modal"
        onClick={(e) => e.stopPropagation()}
        className="sx-sheet-enter w-full max-w-md rounded-[var(--sx-radius)] bg-[var(--sx-surface-container)]/85 backdrop-blur-2xl backdrop-saturate-150 border border-[var(--sx-outline)] ring-1 ring-inset ring-white/15 p-5 sm:p-6 shadow-2xl space-y-5 max-h-[88dvh] overflow-y-auto no-scrollbar"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2
              id="create-room-title"
              className="text-lg sm:text-xl font-black tracking-tight text-[var(--sx-on-surface)] flex items-center gap-2"
            >
              {isQuickEpisode && (
                <Radio className="w-4 h-4 text-[var(--sx-primary)] shrink-0" />
              )}
              <span>
                {mode === 'change-anime'
                  ? 'Change anime'
                  : isQuickEpisode
                    ? 'Start Watch Party'
                    : 'Create a room'}
              </span>
            </h2>
            <p className="text-xs text-[var(--sx-on-surface-muted)] leading-relaxed">
              {mode === 'change-anime'
                ? 'Switch what everyone in this Watch Together room is watching.'
                : isQuickEpisode
                  ? 'Create a synced Watch Together room for this episode and jump straight in.'
                  : 'Pick what to watch. You control playback; everyone in the room follows.'}
            </p>
          </div>

          <button
            type="button"
            data-testid="create-room-close-btn"
            onClick={onClose}
            aria-label="Close Create a room"
            className="w-9 h-9 rounded-full bg-[var(--sx-surface-high)]/80 hover:bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] flex items-center justify-center text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isQuickEpisode && selectedAnime ? (
            <div className="space-y-3">
              {/* Pre-seeded Locked Episode Summary Card */}
              <div
                data-testid="create-room-quick-episode-card"
                className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--sx-surface-high)]/60 backdrop-blur-md border border-[var(--sx-outline)]"
              >
                <div className="w-11 h-14 rounded-xl overflow-hidden bg-[var(--sx-surface-container)] shrink-0 border border-[var(--sx-outline)]">
                  {selectedAnime.cover || selectedAnime.banner ? (
                    <SmartImage
                      src={selectedAnime.cover || selectedAnime.banner}
                      alt={animeTitle}
                      fallbackTitle={animeTitle}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Tv className="w-4 h-4 text-[var(--sx-primary)]" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-extrabold text-[var(--sx-on-surface)] truncate">
                    {animeTitle}
                  </p>
                  <p className="text-xs font-bold text-[var(--sx-primary)] truncate">
                    Episode {episodeNumber}
                    {activeEpisodeItem?.title &&
                    activeEpisodeItem.title !== `Episode ${episodeNumber}`
                      ? ` · ${activeEpisodeItem.title}`
                      : ''}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <span className="block text-[11px] font-bold tracking-[0.12em] uppercase text-[var(--sx-on-surface-muted)]">
                  Track
                </span>
                <div className="grid grid-cols-2 p-1 rounded-full bg-[var(--sx-surface-high)]/60 border border-[var(--sx-outline)] min-h-[42px]">
                  {(['H-Sub', 'Dub'] as WatchPartyTrack[]).map((opt) => {
                    const active = track === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        data-testid={`create-room-track-${opt.toLowerCase().replace(/[^a-z]/g, '')}`}
                        onClick={() => setTrack(opt)}
                        className={`rounded-full text-xs font-extrabold whitespace-nowrap transition-colors ${
                          active
                            ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] shadow-sm'
                            : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* ANIME selector */}
              <div className="space-y-2 relative">
                <label className="block text-[11px] font-bold tracking-[0.12em] uppercase text-[var(--sx-on-surface-muted)]">
                  Anime
                </label>

                {selectedAnime ? (
                  <div
                    data-testid="create-room-selected-anime"
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl bg-[var(--sx-surface-high)]/55 border border-[var(--sx-outline)]"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-9 rounded-lg overflow-hidden bg-[var(--sx-surface-container)] shrink-0 border border-[var(--sx-outline)]">
                        {selectedAnime.cover ? (
                          <SmartImage
                            src={selectedAnime.cover}
                            alt={animeTitle}
                            fallbackTitle={animeTitle}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Tv className="w-3.5 h-3.5 text-[var(--sx-primary)]" />
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-bold text-[var(--sx-on-surface)] truncate">
                        {animeTitle}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        data-testid="create-room-clear-anime-btn"
                        onClick={handleClearAnime}
                        aria-label="Clear selected anime"
                        className="w-7 h-7 rounded-full hover:bg-[var(--sx-surface-container)] flex items-center justify-center text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs font-semibold tabular-nums text-[var(--sx-on-surface-muted)] whitespace-nowrap">
                        {epTotalCount} ep
                      </span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="relative flex items-center">
                      <Search className="w-4 h-4 text-[var(--sx-on-surface-muted)] absolute left-3.5 pointer-events-none" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        data-testid="create-room-anime-search"
                        value={searchQuery}
                        onFocus={() => setSearchOpen(true)}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setSearchOpen(true);
                          setValidationError(null);
                        }}
                        placeholder="Search anime"
                        className="w-full min-h-[46px] pl-10 pr-4 py-2.5 rounded-2xl bg-[var(--sx-surface-high)]/55 border border-[var(--sx-outline)] text-sm font-medium text-[var(--sx-on-surface)] placeholder:text-[var(--sx-on-surface-muted)] focus:outline-none focus:border-[var(--sx-primary)] transition-colors"
                      />
                    </div>

                    {(searchOpen || searchQuery.trim().length > 0) && (
                      <div
                        data-testid="create-room-anime-results"
                        className="mt-2 rounded-2xl bg-[var(--sx-surface)]/92 backdrop-blur-2xl border border-[var(--sx-outline)] shadow-xl max-h-52 overflow-y-auto divide-y divide-[var(--sx-outline)]"
                      >
                        {searching && searchResults.length === 0 ? (
                          <p className="px-4 py-3 text-xs font-medium text-[var(--sx-on-surface-muted)]">
                            Searching anime...
                          </p>
                        ) : searchResults.length === 0 ? (
                          <p className="px-4 py-3 text-xs font-medium text-[var(--sx-on-surface-muted)]">
                            No matching anime found. Try another title.
                          </p>
                        ) : (
                          searchResults.map((item) => {
                            const itemTitle =
                              item.title.english || item.title.romaji || item.title.native || 'Anime';
                            return (
                              <button
                                key={item.id}
                                type="button"
                                data-testid={`create-room-anime-option-${item.id}`}
                                onClick={() => handleSelectAnime(item)}
                                className="w-full px-3 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-[var(--sx-surface-high)]/60 transition-colors"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-8 h-10 rounded-lg overflow-hidden bg-[var(--sx-surface-high)] shrink-0">
                                    {item.cover ? (
                                      <SmartImage
                                        src={item.cover}
                                        alt={itemTitle}
                                        fallbackTitle={itemTitle}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <Tv className="w-3.5 h-3.5 text-[var(--sx-primary)]" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-[var(--sx-on-surface)] truncate">
                                      {itemTitle}
                                    </p>
                                    {item.format && (
                                      <p className="text-[11px] text-[var(--sx-on-surface-muted)] truncate">
                                        {item.format}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <span className="text-[11px] font-semibold tabular-nums text-[var(--sx-on-surface-muted)] whitespace-nowrap shrink-0">
                                  {item.episodes ? `${item.episodes} ep` : '12+ ep'}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* EPISODE & TRACK controls (shown once anime is selected) */}
              {selectedAnime && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label
                      htmlFor="create-room-ep-select"
                      className="block text-[11px] font-bold tracking-[0.12em] uppercase text-[var(--sx-on-surface-muted)]"
                    >
                      Episode
                    </label>
                    <div className="relative">
                      <select
                        id="create-room-ep-select"
                        data-testid="create-room-episode-select"
                        value={episodeNumber}
                        onChange={(e) => setEpisodeNumber(Number(e.target.value) || 1)}
                        className="w-full min-h-[44px] appearance-none pl-3.5 pr-9 py-2 rounded-2xl bg-[var(--sx-surface-high)]/55 border border-[var(--sx-outline)] text-sm font-semibold text-[var(--sx-on-surface)] focus:outline-none focus:border-[var(--sx-primary)] cursor-pointer"
                      >
                        {episodes.map((ep) => (
                          <option key={ep.id} value={ep.number}>
                            Episode {ep.number}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-[var(--sx-on-surface-muted)] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="block text-[11px] font-bold tracking-[0.12em] uppercase text-[var(--sx-on-surface-muted)]">
                      Track
                    </span>
                    <div className="grid grid-cols-2 p-1 rounded-full bg-[var(--sx-surface-high)]/60 border border-[var(--sx-outline)] min-h-[44px]">
                      {(['H-Sub', 'Dub'] as WatchPartyTrack[]).map((opt) => {
                        const active = track === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            data-testid={`create-room-track-${opt.toLowerCase().replace(/[^a-z]/g, '')}`}
                            onClick={() => setTrack(opt)}
                            className={`rounded-full text-xs font-extrabold whitespace-nowrap transition-colors ${
                              active
                                ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] shadow-sm'
                                : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {mode === 'create' && (
            <>
              {/* ROOM NAME */}
              <div className="space-y-2">
                <label
                  htmlFor="create-room-name-input"
                  className="block text-[11px] font-bold tracking-[0.12em] uppercase text-[var(--sx-on-surface-muted)]"
                >
                  Room name
                </label>
                <input
                  id="create-room-name-input"
                  type="text"
                  data-testid="create-room-name-input"
                  maxLength={48}
                  value={roomNameDraft}
                  onChange={(e) => setRoomNameDraft(e.target.value)}
                  placeholder={defaultRoomName}
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl bg-[var(--sx-surface-high)]/55 border border-[var(--sx-outline)] text-sm font-medium text-[var(--sx-on-surface)] placeholder:text-[var(--sx-on-surface-muted)] focus:outline-none focus:border-[var(--sx-primary)] transition-colors"
                />
              </div>

              {/* WHO CAN JOIN */}
              <div className="space-y-2">
                <span className="block text-[11px] font-bold tracking-[0.12em] uppercase text-[var(--sx-on-surface-muted)]">
                  Who can join
                </span>
                <div className="inline-flex p-1 rounded-full bg-[var(--sx-surface-high)]/60 border border-[var(--sx-outline)]">
                  <button
                    type="button"
                    data-testid="create-room-public-btn"
                    onClick={() => setIsPublic(true)}
                    className={`min-h-[38px] px-5 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap transition-colors ${
                      isPublic
                        ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] shadow-sm'
                        : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                    }`}
                  >
                    Public
                  </button>
                  <button
                    type="button"
                    data-testid="create-room-private-btn"
                    onClick={() => setIsPublic(false)}
                    className={`min-h-[38px] px-5 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap transition-colors ${
                      !isPublic
                        ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] shadow-sm'
                        : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                    }`}
                  >
                    Private
                  </button>
                </div>
                <p className="text-xs text-[var(--sx-on-surface-muted)]">
                  {isPublic
                    ? 'Listed in the lobby. Anyone can join.'
                    : 'Invite only. Share the room code to join.'}
                </p>
              </div>
            </>
          )}

          {validationError && (
            <p
              data-testid="create-room-error"
              className="text-xs font-semibold text-red-500 dark:text-red-300 bg-red-500/10 border border-red-500/25 rounded-2xl px-3.5 py-2.5"
            >
              {validationError}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            data-testid="create-room-submit-btn"
            className="w-full min-h-[48px] px-5 py-3 rounded-full bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-sm font-extrabold flex items-center justify-center whitespace-nowrap shadow-md hover:opacity-92 active:scale-[0.99] transition-all"
          >
            {mode === 'change-anime'
              ? 'Switch anime'
              : isQuickEpisode
                ? 'Create Watch Room'
                : 'Create room'}
          </button>
        </form>
      </div>
    </div>
  );

  if (!isFullscreen && typeof document !== 'undefined') {
    return createPortal(modalNode, document.body);
  }
  return modalNode;
};
