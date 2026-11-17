import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Globe,
  Lock,
  LogOut,
  MessageSquare,
  Power,
  RefreshCw,
  Search,
  Settings,
  Share2,
  Tv,
  Users,
} from 'lucide-react';
import { InlineAnimePlayer } from '../components/InlineAnimePlayer';
import { WatchPartyUI } from '../components/WatchPartyUI';
import {
  CreateWatchRoomModal,
  CreateWatchRoomPayload,
} from '../components/CreateWatchRoomModal';
import { SmartImage } from '../components/SmartImage';
import { useApp } from '../store/AppContext';
import { useWatchParty } from '../hooks/useWatchParty';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatMediaDocumentTitle } from '../utils/documentTitle';
import { getPreferredTitle, UnifiedEpisode, UnifiedMedia } from '../types/media';
import {
  buildWatchPartyInviteUrl,
  getHostDisplayName,
  getParticipantInitial,
  isValidRoomCode,
  normalizeRoomCode,
  resolveDefaultDisplayName,
  WatchPartyRoom,
  WatchPartySyncPayload,
  WatchPartyTrack,
} from '../utils/watchParty';
import { clampEpisodeIndex, resolveAudioLanguageOption } from '../utils/inlinePlayer';
import { fetchMediaDetails } from '../services/discoveryService';
import { resolveEpisodesForMedia } from '../services/sourceEngine';

interface AutoCreateState {
  userName?: string;
  roomName?: string;
  track?: WatchPartyTrack;
  isPublic?: boolean;
  hostAvatar?: string;
  media: UnifiedMedia;
  episodes?: UnifiedEpisode[];
  episodeIndex?: number;
  sourceId?: string;
  currentTime?: number;
  isPlaying?: boolean;
}

interface WatchRoomLocationState {
  autoCreateWatchParty?: AutoCreateState;
  media?: UnifiedMedia;
  episodes?: UnifiedEpisode[];
  episodeIndex?: number;
  sourceId?: string;
}

function buildFallbackEpisodes(
  mediaId: string,
  totalEpisodes: number,
  activeEpNum: number,
  activeEpTitle?: string,
  banner?: string | null,
  cover?: string | null,
): UnifiedEpisode[] {
  const count = Math.max(1, totalEpisodes || 1, activeEpNum || 1);
  return Array.from({ length: count }, (_, idx) => {
    const num = idx + 1;
    return {
      id: `${mediaId}-ep-${num}`,
      number: num,
      title: num === activeEpNum && activeEpTitle ? activeEpTitle : `Episode ${num}`,
      thumbnail: banner || cover || null,
    };
  });
}

export const WatchTogetherRoomPage: React.FC = () => {
  const { roomCode: paramRoomCode = '' } = useParams<{ roomCode: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { state, updatePlayerPrefs } = useApp();

  const navState = (location.state as WatchRoomLocationState | null) ?? null;
  const isCreateIntent = paramRoomCode.toLowerCase() === 'new';
  const normalizedParamCode = isCreateIntent ? '' : normalizeRoomCode(paramRoomCode);

  const [media, setMedia] = useState<UnifiedMedia | null>(
    () => navState?.autoCreateWatchParty?.media ?? navState?.media ?? null,
  );
  const [episodes, setEpisodes] = useState<UnifiedEpisode[]>(
    () => navState?.autoCreateWatchParty?.episodes ?? navState?.episodes ?? [],
  );
  const [episodeIndex, setEpisodeIndex] = useState<number>(
    () =>
      navState?.autoCreateWatchParty?.episodeIndex ??
      navState?.episodeIndex ??
      0,
  );
  const [sourceId] = useState<string | undefined>(
    () => navState?.autoCreateWatchParty?.sourceId ?? navState?.sourceId,
  );
  const [initialSyncedTime, setInitialSyncedTime] = useState<number | null>(
    () => navState?.autoCreateWatchParty?.currentTime ?? null,
  );
  const [remoteSyncSignal, setRemoteSyncSignal] = useState<{
    seq: number;
    currentTime: number;
    isPlaying: boolean;
  } | null>(null);
  const syncSeqRef = useRef(0);

  const [episodeMenuOpen, setEpisodeMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [changeAnimeOpen, setChangeAnimeOpen] = useState(false);
  const [chatDrawerOpenOnMobile, setChatDrawerOpenOnMobile] = useState(true);
  const [chatSubTab, setChatSubTab] = useState<'chat' | 'people'>('chat');
  const [chatFocusSignal, setChatFocusSignal] = useState(0);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [copiedRoomCode, setCopiedRoomCode] = useState(false);

  const episodeDropdownRef = useRef<HTMLDivElement>(null);
  const settingsDropdownRef = useRef<HTMLDivElement>(null);
  const chatSectionRef = useRef<HTMLDivElement>(null);
  const enrichedMediaIdRef = useRef<string | null>(null);
  const initiatedActionRef = useRef<string | null>(null);

  const applyHydratedRoom = useCallback((hydrated: WatchPartyRoom, syncedTime: number) => {
    setInitialSyncedTime(syncedTime);
    syncSeqRef.current += 1;
    setRemoteSyncSignal({
      seq: syncSeqRef.current,
      currentTime: syncedTime,
      isPlaying: hydrated.isPlaying,
    });

    setMedia((prev) => {
      if (prev && prev.id === hydrated.mediaId) {
        return {
          ...prev,
          cover: prev.cover || hydrated.mediaCover || undefined,
          banner: prev.banner || hydrated.mediaBanner || undefined,
          episodes: prev.episodes || hydrated.totalEpisodes || hydrated.episodeNumber,
        };
      }
      return {
        id: hydrated.mediaId,
        type: 'ANIME',
        title: { english: hydrated.mediaTitle },
        cover: hydrated.mediaCover || undefined,
        banner: hydrated.mediaBanner || undefined,
        episodes: Math.max(hydrated.totalEpisodes || 1, hydrated.episodeNumber || 1),
      };
    });

    setEpisodes((prev) => {
      if (prev.length >= hydrated.episodeNumber) return prev;
      return buildFallbackEpisodes(
        hydrated.mediaId,
        Math.max(hydrated.totalEpisodes || 1, hydrated.episodeNumber),
        hydrated.episodeNumber,
        hydrated.episodeTitle,
        hydrated.mediaBanner,
        hydrated.mediaCover,
      );
    });

    setEpisodeIndex(Math.max(0, (hydrated.episodeNumber || 1) - 1));
  }, []);

  const handleRemoteSync = useCallback((payload: WatchPartySyncPayload) => {
    syncSeqRef.current += 1;
    setRemoteSyncSignal({
      seq: syncSeqRef.current,
      currentTime: payload.currentTime,
      isPlaying: payload.isPlaying,
    });

    if (payload.episodeNumber >= 1) {
      setEpisodeIndex(payload.episodeNumber - 1);
      setEpisodes((prev) => {
        if (prev.length >= payload.episodeNumber) return prev;
        const baseId = prev[0]?.id.split('-ep-')[0] || 'party';
        return buildFallbackEpisodes(
          baseId,
          payload.episodeNumber,
          payload.episodeNumber,
          payload.episodeTitle,
        );
      });
    }
  }, []);

  const {
    room,
    participantId,
    status,
    error,
    lastEventNotice,
    messages,
    reactions,
    createRoom,
    joinRoom,
    leaveRoom,
    endRoom,
    sendSync,
    sendChatMessage,
    sendReaction,
    updateRoomMeta,
  } = useWatchParty({
    onRemoteSync: handleRemoteSync,
    onRoomHydrated: applyHydratedRoom,
  });

  const activeRoomCodeRef = useRef<string | null>(null);
  activeRoomCodeRef.current = room?.roomCode ? normalizeRoomCode(room.roomCode) : null;

  const latestRoomSetupRef = useRef({
    auto: navState?.autoCreateWatchParty,
    profiles: state.profiles,
    titlePreference: state.contentPrefs.titlePreference,
    audioLanguage: state.playerPrefs.audioLanguage,
  });
  latestRoomSetupRef.current = {
    auto: navState?.autoCreateWatchParty,
    profiles: state.profiles,
    titlePreference: state.contentPrefs.titlePreference,
    audioLanguage: state.playerPrefs.audioLanguage,
  };

  // Trigger room creation or room join cleanly on mount / param transition (StrictMode-safe)
  useEffect(() => {
    const { auto, profiles, titlePreference, audioLanguage } = latestRoomSetupRef.current;

    if (isCreateIntent) {
      if (activeRoomCodeRef.current) return;
      if (!auto?.media) {
        navigate('/watch-together', { replace: true });
        return;
      }
      if (initiatedActionRef.current === 'create') return;
      initiatedActionRef.current = 'create';

      const autoEpisodes =
        auto.episodes && auto.episodes.length > 0
          ? auto.episodes
          : buildFallbackEpisodes(
              auto.media.id,
              auto.media.episodes || 12,
              (auto.episodeIndex ?? 0) + 1,
              undefined,
              auto.media.banner,
              auto.media.cover,
            );
      setEpisodes(autoEpisodes);
      const safeIdx = clampEpisodeIndex(auto.episodeIndex ?? 0, autoEpisodes.length);
      setEpisodeIndex(safeIdx);
      const activeEp = autoEpisodes[safeIdx];
      const userName = auto.userName || resolveDefaultDisplayName(profiles);
      const currentAudioOption = resolveAudioLanguageOption(audioLanguage);
      const activeTrack =
        auto.track || (currentAudioOption.serverCategory === 'dub' ? 'Dub' : 'H-Sub');
      const resolvedAvatar =
        auto.hostAvatar ||
        Object.values(profiles).find((p) => Boolean(p?.avatarUrl))?.avatarUrl;

      createRoom({
        userName,
        roomName: auto.roomName || `${userName}'s room`,
        track: activeTrack,
        hostAvatar: resolvedAvatar,
        isPublic: auto.isPublic !== false,
        mediaId: auto.media.id,
        mediaTitle: getPreferredTitle(auto.media.title, titlePreference),
        mediaCover: auto.media.cover ?? null,
        mediaBanner: auto.media.banner ?? null,
        totalEpisodes: autoEpisodes.length,
        episodeNumber: activeEp?.number ?? safeIdx + 1,
        episodeTitle: activeEp?.title ?? `Episode ${safeIdx + 1}`,
        currentTime: auto.currentTime ?? 0,
        isPlaying: auto.isPlaying ?? true,
      });
      return () => {
        if (!activeRoomCodeRef.current) {
          initiatedActionRef.current = null;
        }
      };
    }

    if (!isValidRoomCode(normalizedParamCode)) return;
    if (activeRoomCodeRef.current === normalizedParamCode) return;
    if (initiatedActionRef.current === `join:${normalizedParamCode}`) return;
    initiatedActionRef.current = `join:${normalizedParamCode}`;

    joinRoom({
      roomCode: normalizedParamCode,
      userName: resolveDefaultDisplayName(profiles),
    });

    return () => {
      if (activeRoomCodeRef.current !== normalizedParamCode) {
        initiatedActionRef.current = null;
      }
    };
  }, [isCreateIntent, normalizedParamCode, createRoom, joinRoom, navigate]);

  // Replace `/watch-together/new` -> `/watch-together/:roomCode` seamlessly on room creation
  useEffect(() => {
    if (isCreateIntent && room?.roomCode) {
      navigate(`/watch-together/${encodeURIComponent(room.roomCode)}`, {
        replace: true,
        state: {
          media,
          episodes,
          episodeIndex,
          sourceId,
        },
      });
    }
  }, [isCreateIntent, room?.roomCode, navigate, media, episodes, episodeIndex, sourceId]);

  // Enrich media & episode list when joining via direct link
  useEffect(() => {
    const targetMediaId = room?.mediaId || media?.id;
    if (!targetMediaId) return;
    if (enrichedMediaIdRef.current === targetMediaId && episodes.length > 1) return;
    if (episodes.length > 0 && media?.description) return;

    enrichedMediaIdRef.current = targetMediaId;
    let cancelled = false;

    fetchMediaDetails(targetMediaId, 'ANIME')
      .then(async (full) => {
        if (cancelled) return;
        setMedia((prev) => ({
          ...full,
          cover: full.cover || prev?.cover,
          banner: full.banner || prev?.banner,
        }));
        const eps = await resolveEpisodesForMedia(full);
        if (!cancelled && eps.length > 0) {
          setEpisodes(eps);
        }
      })
      .catch(() => {
        // Fallback synthetic episodes remain usable
      });

    return () => {
      cancelled = true;
    };
  }, [room?.mediaId, media?.id, media?.description, episodes.length]);

  // Sync local audio preference with active room track
  useEffect(() => {
    if (!room?.track) return;
    const expectedCategory = room.track === 'Dub' ? 'dub' : 'sub';
    const currentCategory = resolveAudioLanguageOption(state.playerPrefs.audioLanguage).serverCategory;
    if (currentCategory !== expectedCategory) {
      updatePlayerPrefs({ audioLanguage: expectedCategory === 'dub' ? 'en' : 'ja' });
    }
  }, [room?.track, state.playerPrefs.audioLanguage, updatePlayerPrefs]);

  // Close dropdown menus on outside click
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (
        episodeMenuOpen &&
        episodeDropdownRef.current &&
        !episodeDropdownRef.current.contains(e.target as Node)
      ) {
        setEpisodeMenuOpen(false);
      }
      if (
        settingsMenuOpen &&
        settingsDropdownRef.current &&
        !settingsDropdownRef.current.contains(e.target as Node)
      ) {
        setSettingsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [episodeMenuOpen, settingsMenuOpen]);

  const isHost = Boolean(room && participantId && room.hostId === participantId);

  const effectiveMedia: UnifiedMedia = useMemo(() => {
    if (media) return media;
    return {
      id: room?.mediaId || 'unknown',
      type: 'ANIME',
      title: { english: room?.mediaTitle || 'Watch Party' },
      cover: room?.mediaCover || undefined,
      banner: room?.mediaBanner || undefined,
      episodes: room?.totalEpisodes || room?.episodeNumber || 1,
    };
  }, [media, room]);

  const effectiveEpisodes: UnifiedEpisode[] = useMemo(() => {
    if (episodes.length > 0) return episodes;
    return buildFallbackEpisodes(
      effectiveMedia.id,
      room?.totalEpisodes || room?.episodeNumber || 1,
      room?.episodeNumber || 1,
      room?.episodeTitle,
      effectiveMedia.banner,
      effectiveMedia.cover,
    );
  }, [episodes, effectiveMedia, room?.totalEpisodes, room?.episodeNumber, room?.episodeTitle]);

  const safeEpisodeIndex = clampEpisodeIndex(episodeIndex, effectiveEpisodes.length);
  const currentEpisode = effectiveEpisodes[safeEpisodeIndex] ?? effectiveEpisodes[0];
  const displayTitle = room?.mediaTitle || getPreferredTitle(effectiveMedia.title, state.contentPrefs.titlePreference);
  const hostName = room ? getHostDisplayName(room) : resolveDefaultDisplayName(state.profiles);
  const roomDisplayName = room?.roomName || `${hostName}'s room`;
  const activeTrack: WatchPartyTrack = room?.track || 'H-Sub';
  const inviteUrl = room ? buildWatchPartyInviteUrl(room.roomCode) : '';

  useDocumentTitle(
    room
      ? formatMediaDocumentTitle({
          mediaTitle: `${displayTitle} · Watch Together`,
          episodeNumber: room.episodeNumber,
        })
      : 'ShizuTv — Watch Together',
  );

  const handleEpisodeIndexChange = useCallback(
    (nextIndex: number) => {
      if (!isHost) return;
      const clamped = clampEpisodeIndex(nextIndex, effectiveEpisodes.length);
      const nextEp = effectiveEpisodes[clamped];
      if (!nextEp) return;

      setEpisodeIndex(clamped);
      setEpisodeMenuOpen(false);
      setInitialSyncedTime(0);

      sendSync({
        action: 'episode',
        currentTime: 0,
        isPlaying: true,
        episodeNumber: nextEp.number,
        episodeTitle: nextEp.title,
      });
      updateRoomMeta({
        episodeNumber: nextEp.number,
        episodeTitle: nextEp.title,
        totalEpisodes: effectiveEpisodes.length,
      });
    },
    [isHost, effectiveEpisodes, sendSync, updateRoomMeta],
  );

  const handleSelectTrack = (nextTrack: WatchPartyTrack) => {
    if (!isHost || nextTrack === activeTrack) return;
    updateRoomMeta({ track: nextTrack });
    updatePlayerPrefs({ audioLanguage: nextTrack === 'Dub' ? 'en' : 'ja' });
  };

  const handleChangeAnimeSubmit = (payload: CreateWatchRoomPayload) => {
    setChangeAnimeOpen(false);
    const nextEps =
      payload.episodes.length > 0
        ? payload.episodes
        : buildFallbackEpisodes(
            payload.media.id,
            payload.media.episodes || 12,
            payload.episodeIndex + 1,
            undefined,
            payload.media.banner,
            payload.media.cover,
          );
    const safeIdx = clampEpisodeIndex(payload.episodeIndex, nextEps.length);
    const nextEp = nextEps[safeIdx];
    const nextTitle = getPreferredTitle(payload.media.title, state.contentPrefs.titlePreference);

    setMedia(payload.media);
    setEpisodes(nextEps);
    setEpisodeIndex(safeIdx);
    setInitialSyncedTime(0);

    updateRoomMeta({
      mediaId: payload.media.id,
      mediaTitle: nextTitle,
      mediaCover: payload.media.cover ?? null,
      mediaBanner: payload.media.banner ?? null,
      totalEpisodes: nextEps.length,
      episodeNumber: nextEp?.number ?? safeIdx + 1,
      episodeTitle: nextEp?.title ?? `Episode ${safeIdx + 1}`,
      track: payload.track,
      isPublic: payload.isPublic,
    });
    updatePlayerPrefs({ audioLanguage: payload.track === 'Dub' ? 'en' : 'ja' });
    sendSync({
      action: 'episode',
      currentTime: 0,
      isPlaying: true,
      episodeNumber: nextEp?.number ?? safeIdx + 1,
      episodeTitle: nextEp?.title ?? `Episode ${safeIdx + 1}`,
    });
  };

  const handlePlaybackSync = useCallback(
    (payload: WatchPartySyncPayload) => {
      if (!isHost) return;
      sendSync(payload);
    },
    [isHost, sendSync],
  );

  const handleLeave = () => {
    setSettingsMenuOpen(false);
    leaveRoom();
    navigate('/watch-together');
  };

  const handleEndRoom = () => {
    setSettingsMenuOpen(false);
    endRoom();
    navigate('/watch-together');
  };

  const handleResyncStream = () => {
    if (!room) return;
    syncSeqRef.current += 1;
    const elapsedSec =
      room.isPlaying && room.updatedAt
        ? Math.max(0, Math.min(30, (Date.now() - room.updatedAt) / 1000))
        : 0;
    const targetTime = Math.max(0, (room.currentTime || 0) + elapsedSec);
    setRemoteSyncSignal({
      seq: syncSeqRef.current,
      currentTime: targetTime,
      isPlaying: room.isPlaying,
    });
    setSettingsMenuOpen(false);
  };

  const handleCopyInviteLink = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedInvite(true);
      window.setTimeout(() => setCopiedInvite(false), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleCopyRoomCode = async () => {
    if (!room?.roomCode) return;
    try {
      await navigator.clipboard.writeText(room.roomCode);
      setCopiedRoomCode(true);
      window.setTimeout(() => setCopiedRoomCode(false), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleOpenViewersList = () => {
    setChatDrawerOpenOnMobile(true);
    setChatSubTab('people');
    window.setTimeout(() => {
      chatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  };

  const handleChatButtonClick = () => {
    setChatDrawerOpenOnMobile(true);
    setChatSubTab('chat');
    setChatFocusSignal((s) => s + 1);
    window.setTimeout(() => {
      chatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  };

  if (error && !room) {
    return (
      <div
        data-testid="watch-room-error-state"
        className="px-4 sm:px-6 lg:px-8 pt-10 pb-16 max-w-2xl mx-auto"
      >
        <div className="rounded-3xl bg-[var(--sx-surface-container)]/90 border border-[var(--sx-outline)] p-6 sm:p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-red-500/15 text-red-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-black text-[var(--sx-on-surface)]">
            Watch room unavailable
          </h1>
          <p className="text-sm text-[var(--sx-on-surface-muted)]">{error}</p>
          <button
            type="button"
            onClick={() => navigate('/watch-together')}
            className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-full bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-sm font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Watch Together</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="watch-together-room-page"
      className="px-3.5 sm:px-6 lg:px-8 pt-3.5 pb-12 max-w-6xl mx-auto space-y-4"
    >
      {/* Top Breadcrumb + Chat Pill Row matching reference screenshot */}
      <div className="flex items-center justify-between gap-3">
        <nav
          aria-label="Watch room breadcrumb"
          className="flex items-center gap-2 min-w-0 text-xs sm:text-sm"
        >
          <button
            type="button"
            data-testid="watch-room-breadcrumb-lobby"
            onClick={handleLeave}
            className="font-semibold text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] transition-colors whitespace-nowrap shrink-0"
          >
            Watch Together
          </button>
          <ChevronRight
            aria-hidden="true"
            className="w-3.5 h-3.5 text-[var(--sx-on-surface-muted)] shrink-0"
          />
          <span
            data-testid="watch-room-breadcrumb-title"
            className="font-bold text-[var(--sx-on-surface)] truncate"
          >
            {roomDisplayName}
          </span>
        </nav>

        <button
          type="button"
          data-testid="watch-room-chat-toggle-btn"
          onClick={handleChatButtonClick}
          className="min-h-[36px] px-3.5 py-1.5 rounded-full bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] hover:border-[var(--sx-primary)]/45 text-xs font-bold text-[var(--sx-on-surface)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Chat</span>
          {messages.length > 0 && (
            <span className="tabular-nums text-[var(--sx-primary)] font-extrabold">
              {messages.length}
            </span>
          )}
        </button>
      </div>

      {/* Main Responsive Layout:
          Mobile stacks: Player+Bar -> Live Comments -> Compact Anime Detail -> Invite Friends
          Desktop places Live Comments sticky in right column cleanly */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-3.5 lg:gap-5 items-start">
        {/* Column 1 Top: Player + Single-Line Compact Controls Row */}
        <div className="min-w-0 space-y-2.5 lg:col-start-1">
          {/* Live-Synced Inline Video Player */}
          <div data-testid="watch-room-player-wrap" className="min-w-0">
            <InlineAnimePlayer
              media={effectiveMedia}
              episodes={effectiveEpisodes}
              episodeIndex={safeEpisodeIndex}
              sourceId={sourceId}
              initialTime={initialSyncedTime}
              initialResumePlaying={room?.isPlaying ?? true}
              onChangeEpisodeIndex={handleEpisodeIndexChange}
              watchPartyMode={{
                isHost,
                viewerCount: room?.participants.length ?? 1,
                remoteSyncSignal,
                onPlaybackSync: handlePlaybackSync,
                reactions,
                hideBottomControlsBar: true,
              }}
            />
          </div>

          {/* Single-Line Compact Controls Row: < [Ep N ▾] >  ...  [🔍 Change] [👥 N] [⚙️] */}
          <div
            data-testid="watch-room-compact-bar"
            className="flex items-center justify-between gap-1.5 flex-nowrap"
          >
            {/* Episode Cluster */}
            <div className="flex items-center gap-1 min-w-0 shrink-0">
              <button
                type="button"
                data-testid="watch-room-prev-ep-btn"
                aria-label="Previous episode"
                disabled={!isHost || safeEpisodeIndex <= 0}
                onClick={() => handleEpisodeIndexChange(safeEpisodeIndex - 1)}
                className="w-8 h-8 rounded-full bg-[var(--sx-surface-container)]/85 backdrop-blur-md border border-[var(--sx-outline)] flex items-center justify-center text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)]/50 disabled:opacity-40 transition-colors shrink-0"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <div ref={episodeDropdownRef} className="relative">
                <button
                  type="button"
                  data-testid="watch-room-ep-select"
                  aria-expanded={episodeMenuOpen}
                  disabled={!isHost}
                  onClick={() => {
                    setEpisodeMenuOpen((v) => !v);
                    setSettingsMenuOpen(false);
                  }}
                  className="h-8 px-2.5 sm:px-3 rounded-full bg-[var(--sx-surface-container)]/85 backdrop-blur-md border border-[var(--sx-outline)] hover:border-[var(--sx-primary)]/50 text-xs font-bold text-[var(--sx-on-surface)] inline-flex items-center gap-1 whitespace-nowrap disabled:opacity-75 transition-colors"
                >
                  <span>Ep {currentEpisode?.number ?? 1}</span>
                  <ChevronDown
                    className={`w-3 h-3 transition-transform ${
                      episodeMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {episodeMenuOpen && (
                  <div
                    data-testid="watch-room-ep-menu"
                    className="sx-sheet-enter absolute left-0 top-10 z-40 w-60 max-h-64 overflow-y-auto rounded-2xl bg-[var(--sx-surface-container)]/92 backdrop-blur-2xl backdrop-saturate-150 border border-[var(--sx-outline)] ring-1 ring-inset ring-white/10 shadow-2xl p-1.5 space-y-1"
                  >
                    {effectiveEpisodes.map((ep, idx) => {
                      const active = idx === safeEpisodeIndex;
                      return (
                        <button
                          key={ep.id}
                          type="button"
                          onClick={() => handleEpisodeIndexChange(idx)}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between gap-2 transition-colors ${
                            active
                              ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                              : 'text-[var(--sx-on-surface)] hover:bg-[var(--sx-surface-high)]'
                          }`}
                        >
                          <span className="truncate">
                            Episode {ep.number}
                            {ep.title && ep.title !== `Episode ${ep.number}` ? ` · ${ep.title}` : ''}
                          </span>
                          {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="button"
                data-testid="watch-room-next-ep-btn"
                aria-label="Next episode"
                disabled={!isHost || safeEpisodeIndex >= effectiveEpisodes.length - 1}
                onClick={() => handleEpisodeIndexChange(safeEpisodeIndex + 1)}
                className="w-8 h-8 rounded-full bg-[var(--sx-surface-container)]/85 backdrop-blur-md border border-[var(--sx-outline)] flex items-center justify-center text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)]/50 disabled:opacity-40 transition-colors shrink-0"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Action Cluster: Change Anime + Total Watching Users + Settings */}
            <div className="flex items-center gap-1.5 min-w-0 shrink-0">
              {isHost && (
                <button
                  type="button"
                  data-testid="watch-room-change-anime-btn"
                  onClick={() => setChangeAnimeOpen(true)}
                  className="h-8 px-2.5 sm:px-3 rounded-full bg-[var(--sx-surface-container)]/85 backdrop-blur-md border border-[var(--sx-outline)] hover:border-[var(--sx-primary)]/50 text-[11px] sm:text-xs font-bold text-[var(--sx-on-surface)] inline-flex items-center gap-1.5 whitespace-nowrap transition-colors shrink-0"
                >
                  <Search className="w-3 h-3 shrink-0" />
                  <span className="sm:hidden">Change</span>
                  <span className="hidden sm:inline">Change anime</span>
                </button>
              )}

              <button
                type="button"
                data-testid="watch-room-viewer-count"
                onClick={handleOpenViewersList}
                title="View watching users"
                aria-label={`${room?.participants.length ?? 1} watching users`}
                className="h-8 px-2.5 rounded-full bg-[var(--sx-surface-container)]/85 backdrop-blur-md border border-[var(--sx-outline)] hover:border-[var(--sx-primary)]/50 text-[11px] sm:text-xs font-bold text-[var(--sx-on-surface)] inline-flex items-center gap-1 whitespace-nowrap tabular-nums transition-colors shrink-0"
              >
                <Users className="w-3.5 h-3.5 text-[var(--sx-primary)] shrink-0" />
                <span>{room?.participants.length ?? 1}</span>
              </button>

              <div ref={settingsDropdownRef} className="relative shrink-0">
                <button
                  type="button"
                  data-testid="watch-room-settings-btn"
                  aria-label="Room settings"
                  aria-expanded={settingsMenuOpen}
                  onClick={() => {
                    setSettingsMenuOpen((v) => !v);
                    setEpisodeMenuOpen(false);
                  }}
                  className={`w-8 h-8 rounded-full backdrop-blur-md border flex items-center justify-center transition-colors shrink-0 ${
                    settingsMenuOpen
                      ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] border-[var(--sx-primary)]'
                      : 'bg-[var(--sx-surface-container)]/85 border-[var(--sx-outline)] hover:border-[var(--sx-primary)]/50 text-[var(--sx-on-surface)]'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>

                {settingsMenuOpen && room && (
                  <div
                    data-testid="watch-room-settings-menu"
                    className="sx-sheet-enter absolute right-0 top-10 z-50 w-72 max-w-[calc(100vw-28px)] rounded-2xl bg-[var(--sx-surface-container)]/92 backdrop-blur-2xl backdrop-saturate-150 border border-[var(--sx-outline)] ring-1 ring-inset ring-white/15 shadow-2xl p-3 space-y-2.5"
                  >
                    {/* Room Code + Quick Copy */}
                    <div className="flex items-center justify-between gap-2 px-1">
                      <div>
                        <span className="block font-bold text-[var(--sx-on-surface-muted)] uppercase tracking-wider text-[10px]">
                          Room Code
                        </span>
                        <span className="font-mono font-extrabold text-xs text-[var(--sx-on-surface)] tracking-widest">
                          {room.roomCode}
                        </span>
                      </div>
                      <button
                        type="button"
                        data-testid="watch-room-copy-code-btn"
                        onClick={() => void handleCopyRoomCode()}
                        className="h-7 px-2.5 rounded-full bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-[11px] font-bold text-[var(--sx-on-surface)] inline-flex items-center gap-1 hover:border-[var(--sx-primary)]/50 transition-colors"
                      >
                        {copiedRoomCode ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-500" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Track Selector (Moved from main bar into Settings) */}
                    <div className="rounded-xl bg-[var(--sx-surface-high)]/75 border border-[var(--sx-outline)] p-2 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)] px-0.5">
                        <span>Audio Track</span>
                        {!isHost && <span>Host controlled</span>}
                      </div>
                      <div className="grid grid-cols-2 gap-1 p-0.5 rounded-full bg-[var(--sx-surface)]/80 border border-[var(--sx-outline)]">
                        {(['H-Sub', 'Dub'] as WatchPartyTrack[]).map((opt) => {
                          const active = activeTrack === opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              disabled={!isHost}
                              data-testid={`watch-room-track-${opt.toLowerCase().replace(/[^a-z]/g, '')}`}
                              onClick={() => handleSelectTrack(opt)}
                              className={`h-7 rounded-full text-[11px] font-extrabold transition-colors disabled:cursor-default ${
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

                    {/* Visibility Toggle (Host-Only) */}
                    {isHost && (
                      <button
                        type="button"
                        data-testid="watch-room-visibility-toggle"
                        onClick={() => updateRoomMeta({ isPublic: !room.isPublic })}
                        className="w-full px-3 py-2 rounded-xl bg-[var(--sx-surface-high)]/80 hover:bg-[var(--sx-primary)]/15 border border-[var(--sx-outline)] text-xs font-bold text-[var(--sx-on-surface)] flex items-center justify-between transition-colors"
                      >
                        <span className="inline-flex items-center gap-2">
                          {room.isPublic ? (
                            <Globe className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Lock className="w-3.5 h-3.5 text-amber-500" />
                          )}
                          <span>{room.isPublic ? 'Public Room' : 'Private Room'}</span>
                        </span>
                        <span className="text-[11px] text-[var(--sx-primary)]">Switch</span>
                      </button>
                    )}

                    {/* Extra Room Utility Options: Re-sync & Toggle Chat */}
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        data-testid="watch-room-resync-btn"
                        onClick={handleResyncStream}
                        className="px-2.5 py-2 rounded-xl bg-[var(--sx-surface-high)]/80 hover:bg-[var(--sx-primary)]/15 border border-[var(--sx-outline)] text-[11px] font-bold text-[var(--sx-on-surface)] inline-flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <RefreshCw className="w-3 h-3 text-[var(--sx-primary)]" />
                        <span>Re-sync Live</span>
                      </button>

                      <button
                        type="button"
                        data-testid="watch-room-toggle-chat-visibility-btn"
                        onClick={() => {
                          setChatDrawerOpenOnMobile((v) => !v);
                          setSettingsMenuOpen(false);
                        }}
                        className="px-2.5 py-2 rounded-xl bg-[var(--sx-surface-high)]/80 hover:bg-[var(--sx-primary)]/15 border border-[var(--sx-outline)] text-[11px] font-bold text-[var(--sx-on-surface)] inline-flex items-center justify-center gap-1.5 transition-colors"
                      >
                        {chatDrawerOpenOnMobile ? (
                          <>
                            <EyeOff className="w-3 h-3" />
                            <span>Hide Chat</span>
                          </>
                        ) : (
                          <>
                            <Eye className="w-3 h-3 text-[var(--sx-primary)]" />
                            <span>Show Chat</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Leave Room (keeps room live) vs End Watch Room (host stops) */}
                    <div className="space-y-1.5 pt-1 border-t border-[var(--sx-outline)]">
                      <button
                        type="button"
                        data-testid="watch-room-leave-btn"
                        onClick={handleLeave}
                        className="w-full px-3 py-2 rounded-xl bg-[var(--sx-surface-high)]/85 hover:bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-xs font-bold text-[var(--sx-on-surface)] flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Leave Room</span>
                      </button>

                      {isHost && (
                        <button
                          type="button"
                          data-testid="watch-room-end-btn"
                          onClick={handleEndRoom}
                          className="w-full px-3 py-2 rounded-xl bg-red-500/12 hover:bg-red-500/20 border border-red-500/20 text-xs font-bold text-red-500 dark:text-red-400 flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Power className="w-3.5 h-3.5" />
                          <span>End Watch Room</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Live Comments & Floating Emoji Reaction Bar (Right after 1-line bar on Mobile; Sticky Right Column on Desktop) */}
        <div
          ref={chatSectionRef}
          data-testid="watch-room-chat-section"
          className={`min-w-0 lg:col-start-2 lg:row-start-1 lg:row-span-4 lg:sticky lg:top-20 ${
            chatDrawerOpenOnMobile ? 'block' : 'hidden lg:block'
          }`}
        >
          {room ? (
            <WatchPartyUI
              room={room}
              currentParticipantId={participantId}
              connectionStatus={status}
              lastEventNotice={lastEventNotice}
              messages={messages}
              reactions={reactions}
              onSendMessage={sendChatMessage}
              onSendReaction={sendReaction}
              onLeaveRoom={handleLeave}
              collapsible={false}
              showInviteStrip={false}
              focusSignal={chatFocusSignal}
              subTab={chatSubTab}
              onSubTabChange={setChatSubTab}
            />
          ) : (
            <div className="rounded-[var(--sx-radius)] bg-[var(--sx-surface-container)]/82 backdrop-blur-xl border border-[var(--sx-outline)] p-6 text-center space-y-2">
              <p className="text-xs font-bold text-[var(--sx-on-surface)]">
                Connecting live room...
              </p>
              <p className="text-[11px] text-[var(--sx-on-surface-muted)]">
                Syncing stream state and live comments
              </p>
            </div>
          )}
        </div>

        {/* Compact Anime Detail Card (Below Live Comments on Mobile) */}
        <section
          data-testid="watch-room-media-info"
          className="lg:col-start-1 rounded-[var(--sx-radius)] bg-[var(--sx-surface-container)]/80 backdrop-blur-xl border border-[var(--sx-outline)] p-3 sm:p-3.5 flex items-center gap-3"
        >
          <div className="w-12 h-16 sm:w-14 sm:h-20 rounded-xl overflow-hidden bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] shrink-0 shadow-sm flex items-center justify-center">
            {effectiveMedia.cover || effectiveMedia.banner ? (
              <SmartImage
                src={effectiveMedia.cover || effectiveMedia.banner}
                alt={displayTitle}
                fallbackTitle={displayTitle}
                className="w-full h-full object-cover"
              />
            ) : (
              <Tv className="w-5 h-5 text-[var(--sx-primary)]" />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <h1 className="text-sm sm:text-base font-black tracking-tight text-[var(--sx-on-surface)] line-clamp-1 leading-snug">
              {displayTitle}
            </h1>

            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="font-extrabold text-[var(--sx-primary)]">
                Ep {room?.episodeNumber ?? currentEpisode?.number ?? 1}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-[10px] font-extrabold uppercase tracking-wider text-[var(--sx-on-surface)]">
                {activeTrack.toUpperCase()}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[var(--sx-surface-high)]/75 border border-[var(--sx-outline)] text-[10px] font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
                {room?.isPublic !== false ? 'PUBLIC' : 'PRIVATE'}
              </span>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-[var(--sx-on-surface-muted)]">
              <span className="inline-flex items-center gap-1.5 min-w-0">
                {room?.hostAvatar ? (
                  <img
                    src={room.hostAvatar}
                    alt={hostName}
                    referrerPolicy="no-referrer"
                    className="w-4 h-4 rounded-full object-cover border border-[var(--sx-outline)] shrink-0"
                  />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-[var(--sx-primary)]/20 text-[var(--sx-primary)] text-[9px] font-extrabold flex items-center justify-center shrink-0">
                    {getParticipantInitial(hostName)}
                  </span>
                )}
                <span className="font-semibold text-[var(--sx-on-surface)]/90 truncate max-w-[140px]">
                  Host: {hostName}
                </span>
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums font-medium whitespace-nowrap">
                {room?.participants.length ?? 1} watching
              </span>
            </div>
          </div>
        </section>

        {/* Invite Friends Card (Below Compact Anime Detail on Mobile) */}
        {room && (
          <section
            data-testid="watch-room-invite-card"
            className="lg:col-start-1 rounded-[var(--sx-radius)] bg-[var(--sx-surface-container)]/80 backdrop-blur-xl border border-[var(--sx-outline)] p-3.5 sm:p-4 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs sm:text-sm font-extrabold text-[var(--sx-on-surface)] flex items-center gap-2">
                <Share2 className="w-3.5 h-3.5 text-[var(--sx-primary)] shrink-0" />
                <span>Invite friends</span>
              </h2>
              <span className="text-[11px] font-mono font-bold tracking-wider text-[var(--sx-on-surface-muted)]">
                {room.roomCode}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div
                data-testid="watch-room-invite-url"
                className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-[var(--sx-surface)]/75 border border-[var(--sx-outline)] font-mono text-[11px] sm:text-xs text-[var(--sx-on-surface)]/85 truncate select-all"
              >
                {inviteUrl}
              </div>

              <button
                type="button"
                data-testid="watch-room-copy-link-btn"
                onClick={() => void handleCopyInviteLink()}
                className="min-h-[36px] px-3.5 py-1.5 rounded-full bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-xs font-extrabold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 hover:opacity-90 transition-opacity"
              >
                {copiedInvite ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy link</span>
                  </>
                )}
              </button>
            </div>
          </section>
        )}
      </div>

      {/* Host Change Anime Modal */}
      <CreateWatchRoomModal
        open={changeAnimeOpen}
        mode="change-anime"
        initialMedia={effectiveMedia}
        initialEpisodes={effectiveEpisodes}
        initialEpisodeNumber={currentEpisode?.number ?? 1}
        onClose={() => setChangeAnimeOpen(false)}
        onSubmit={handleChangeAnimeSubmit}
      />
    </div>
  );
};
