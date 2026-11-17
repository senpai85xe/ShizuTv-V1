import React, { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  ArrowLeft,
  ArrowRight,
  Cast,
  FastForward,
  ListVideo,
  Maximize2,
  Minimize2,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Settings,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useApp, VideoQualityPref } from '../store/AppContext';
import { usePip } from '../store/PipContext';
import {
  getPreferredTitle,
  UnifiedEpisode,
  UnifiedMedia,
  VideoServer,
} from '../types/media';
import { resolveVideoServers, resolveVideoStream } from '../services/sourceEngine';
import { fetchAniSkipIntervals, SkipInterval } from '../services/aniskip';
import { clampSeekTarget, formatPlayerTime } from '../utils/detailsLayout';
import {
  buildHlsQualityOptions,
  clampEpisodeIndex,
  computeAutoSkipTarget,
  findActiveSubtitleCue,
  formatScrubberPercent,
  getEffectiveDurationSeconds,
  getEpisodeNavigationState,
  getVideoFitClass,
  HlsQualityOption,
  resolvePreferredHlsLevel,
  shouldAutoStartPlayback,
  SubtitleCue,
} from '../utils/inlinePlayer';
import {
  canUseNativePictureInPicture,
  resolveInlinePipHandoff,
  shouldAutoEnterPipOnLeave,
} from '../utils/pipPlayer';
import { PlayerEpisodeDrawer } from './PlayerEpisodeDrawer';
import { PlayerSettingsPopover } from './PlayerSettingsPopover';
import {
  EpisodeChangeDirection,
  getEpisodeBadgeTransitionClass,
  getEpisodeChangeDirection,
} from '../utils/detailsMotion';

interface InlineAnimePlayerProps {
  media: UnifiedMedia;
  episodes: UnifiedEpisode[];
  episodeIndex: number;
  sourceId?: string;
  playSignal?: number;
  onChangeEpisodeIndex: (nextIndex: number) => void;
  onOpenFullPlayer?: (index: number) => void;
}

export const InlineAnimePlayer: React.FC<InlineAnimePlayerProps> = ({
  media,
  episodes,
  episodeIndex,
  sourceId,
  playSignal = 0,
  onChangeEpisodeIndex,
  onOpenFullPlayer,
}) => {
  const { state, updatePlayerPrefs, recordHistory, getLibraryEntry, upsertLibraryEntry } =
    useApp();
  const { pipSession, enterInAppPip, closePip, isPipActive } = usePip();

  const safeIndex = clampEpisodeIndex(episodeIndex, episodes.length);
  const currentEpisode: UnifiedEpisode = episodes[safeIndex] ?? {
    id: `${media.id}-ep-1`,
    number: 1,
    title: 'Episode 1',
    thumbnail: media.banner || media.cover || null,
    durationSeconds: (media.duration || 24) * 60,
  };

  const navState = useMemo(
    () => getEpisodeNavigationState(safeIndex, episodes.length),
    [safeIndex, episodes.length],
  );

  const servers = useMemo(() => resolveVideoServers(sourceId), [sourceId]);
  const [selectedServer, setSelectedServer] = useState<VideoServer>(servers[0]);

  useEffect(() => {
    if (servers.length > 0 && !servers.some((s) => s.id === selectedServer?.id)) {
      setSelectedServer(servers[0]);
    }
  }, [servers, selectedServer]);

  const stream = useMemo(
    () => resolveVideoStream(media, currentEpisode, selectedServer || servers[0]),
    [media, currentEpisode, selectedServer, servers],
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const ambientCanvasRef = useRef<HTMLCanvasElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const seekFeedbackTimerRef = useRef<number | null>(null);
  const prevPlaySignalRef = useRef(0);
  const mountedAtRef = useRef(typeof performance !== 'undefined' ? performance.now() : Date.now());
  const handledPipExitRef = useRef(false);
  const pendingStartTimeRef = useRef<number | null>(null);
  const pendingResumePlayRef = useRef<boolean>(false);
  const pipConsumedOnMountRef = useRef(false);

  const [ambientEnabled, setAmbientEnabled] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [hasVideoFrame, setHasVideoFrame] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(state.playerPrefs.defaultSpeed || 1);
  const [activeSubLang, setActiveSubLang] = useState<'en' | 'ja'>('en');
  const [editedCuesMap, setEditedCuesMap] = useState<Record<string, SubtitleCue[]>>({});
  const [hlsQualityOptions, setHlsQualityOptions] = useState<HlsQualityOption[]>([
    { index: -1, label: 'Auto' },
  ]);
  const [selectedHlsLevel, setSelectedHlsLevel] = useState<number>(-1);

  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showServerMenu, setShowServerMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showEpisodeDrawer, setShowEpisodeDrawer] = useState(false);
  const [seekBadge, setSeekBadge] = useState<{ label: string; side: 'left' | 'right'; seq: number } | null>(
    null,
  );
  const seekSeqRef = useRef(0);
  const [epTransition, setEpTransition] = useState<{ index: number; dir: EpisodeChangeDirection }>({
    index: safeIndex,
    dir: 'none',
  });
  if (epTransition.index !== safeIndex) {
    setEpTransition({
      index: safeIndex,
      dir: getEpisodeChangeDirection(epTransition.index, safeIndex),
    });
  }
  const epBadgeAnimClass = getEpisodeBadgeTransitionClass(epTransition.dir);
  const [skipIntervals, setSkipIntervals] = useState<SkipInterval[]>([]);

  const autoPlay = state.playerPrefs.autoPlay;
  const autoNext = state.playerPrefs.autoNextEpisode;
  const autoSkip = state.playerPrefs.autoSkipOp || state.playerPrefs.autoSkipEd;
  const fitMode = state.playerPrefs.videoFit || 'contain';
  const subtitlesOn = state.playerPrefs.subtitleEnabled;

  const scheduleHideControls = (currentlyPlaying = playing) => {
    setShowControls(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (currentlyPlaying && !showServerMenu && !showSettingsMenu && !showEpisodeDrawer) {
      hideTimerRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 3200);
    }
  };

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      if (seekFeedbackTimerRef.current) window.clearTimeout(seekFeedbackTimerRef.current);
    };
  }, []);

  // Hand off from active floating PiP cleanly when returning to Watch tab
  useEffect(() => {
    if (pipSession && !pipConsumedOnMountRef.current) {
      pipConsumedOnMountRef.current = true;
      const handoff = resolveInlinePipHandoff(pipSession, media.id, currentEpisode.number);
      if (handoff.restoreTime !== null) {
        pendingStartTimeRef.current = handoff.restoreTime;
      }
      pendingResumePlayRef.current = handoff.resumePlaying;
      if (handoff.shouldClosePip) {
        closePip();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load HLS or MP4 video stream
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    const resumeAt = pendingStartTimeRef.current;
    const resumePlay = pendingResumePlayRef.current;

    setHasVideoFrame(false);
    setCurrentTime(resumeAt ?? 0);
    setDuration(0);
    setPlaying(false);
    setHlsQualityOptions([{ index: -1, label: 'Auto' }]);
    setSelectedHlsLevel(-1);

    const isNewExplicitTrigger = playSignal > prevPlaySignalRef.current;
    prevPlaySignalRef.current = playSignal;
    const shouldStart =
      !isPipActive() && shouldAutoStartPlayback(autoPlay, isNewExplicitTrigger || resumePlay);
    video.autoplay = false;

    const applyInitialStreamState = () => {
      if (cancelled) return;
      if (pendingStartTimeRef.current === resumeAt) {
        pendingStartTimeRef.current = null;
        pendingResumePlayRef.current = false;
      }
      if (resumeAt && resumeAt > 0.5) {
        try {
          video.currentTime = resumeAt;
        } catch {
          // Ignore seek errors before ready
        }
      }
      video.playbackRate = speed;
      if (shouldStart) {
        video.play().catch(() => {});
      } else if (!video.paused) {
        video.pause();
      }
    };

    let hls: Hls | null = null;
    if (stream.isHls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(stream.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!hls || cancelled) return;
        const options = buildHlsQualityOptions(hls.levels);
        setHlsQualityOptions(options);
        const preferredLevel = resolvePreferredHlsLevel(
          hls.levels,
          state.playerPrefs.defaultQuality,
        );
        hls.currentLevel = preferredLevel;
        setSelectedHlsLevel(preferredLevel);
        applyInitialStreamState();
      });
    } else {
      hlsRef.current = null;
      video.src = stream.url;
      video.addEventListener('loadedmetadata', applyInitialStreamState, { once: true });
      if (video.readyState >= 1) {
        applyInitialStreamState();
      }
    }

    return () => {
      cancelled = true;
      video.removeEventListener('loadedmetadata', applyInitialStreamState);
      if (hls) hls.destroy();
      if (hlsRef.current === hls) hlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.url, stream.isHls, currentEpisode.id]);

  // Respond to explicit play triggers (e.g., episode click or Start Watching CTA while already mounted)
  useEffect(() => {
    if (playSignal <= 0 || playSignal <= prevPlaySignalRef.current) return;
    prevPlaySignalRef.current = playSignal;
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => {});
    scheduleHideControls(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playSignal]);

  // Sync playback rate & muted state
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
      videoRef.current.muted = muted;
    }
  }, [speed, muted]);

  // Fetch AniSkip intervals for current episode
  useEffect(() => {
    setSkipIntervals([]);
    fetchAniSkipIntervals(media.idMal, currentEpisode.number).then(setSkipIntervals);
  }, [media.idMal, currentEpisode.number]);

  // Subtle ambient background glow sampled from active playing frames
  useEffect(() => {
    if (!ambientEnabled || !playing) return;
    let rafId = 0;
    let lastSample = 0;

    const sampleAmbient = (ts: number) => {
      if (ts - lastSample >= 90) {
        lastSample = ts;
        const video = videoRef.current;
        const canvas = ambientCanvasRef.current;
        if (video && canvas && video.readyState >= 2) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            try {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            } catch {
              // Cross-origin video without CORS ACAO falls back to blurred poster/thumbnail aura
            }
          }
        }
      }
      rafId = window.requestAnimationFrame(sampleAmbient);
    };

    rafId = window.requestAnimationFrame(sampleAmbient);
    return () => window.cancelAnimationFrame(rafId);
  }, [ambientEnabled, playing]);

  // Record Watch History & advance progress when playing an episode
  useEffect(() => {
    if (!playing) return;
    recordHistory({
      mediaId: media.id,
      mediaType: media.type,
      media,
      episodeNumber: currentEpisode.number,
      episodeTitle: currentEpisode.title,
      positionSeconds: Math.floor(currentTime),
      durationSeconds: Math.floor(
        getEffectiveDurationSeconds(duration, currentEpisode.durationSeconds, media.duration),
      ),
    });

    const existing = getLibraryEntry(media.id);
    if (existing && currentEpisode.number > existing.progress) {
      void upsertLibraryEntry(
        media,
        existing.status,
        currentEpisode.number,
        existing.score,
        existing.notes,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, currentEpisode.number]);

  // Auto-skip OP/ED when enabled
  const autoSkipTarget = computeAutoSkipTarget(currentTime, skipIntervals, autoSkip);
  useEffect(() => {
    if (autoSkipTarget !== null && videoRef.current) {
      videoRef.current.currentTime = autoSkipTarget;
      setCurrentTime(autoSkipTarget);
    }
  }, [autoSkipTarget]);

  const activeSkip = skipIntervals.find(
    (s) => currentTime >= s.startTime && currentTime < s.endTime - 0.5,
  );

  const trackKey = `${currentEpisode.id}:${activeSubLang}`;
  const activeTrack = stream.subtitles?.find((s) => s.lang === activeSubLang);
  const effectiveCues: SubtitleCue[] = useMemo(() => {
    if (editedCuesMap[trackKey]) return editedCuesMap[trackKey];
    return activeTrack?.cues ?? [];
  }, [editedCuesMap, trackKey, activeTrack]);

  const activeCue = subtitlesOn
    ? findActiveSubtitleCue(
        effectiveCues,
        currentTime,
        state.playerPrefs.subtitleOffsetSeconds || 0,
      )
    : null;

  const triggerSeekFeedback = (delta: number) => {
    const label = delta > 0 ? `+${delta}s` : `${delta}s`;
    const side: 'left' | 'right' = delta < 0 ? 'left' : 'right';
    seekSeqRef.current += 1;
    setSeekBadge({ label, side, seq: seekSeqRef.current });
    if (seekFeedbackTimerRef.current) window.clearTimeout(seekFeedbackTimerRef.current);
    seekFeedbackTimerRef.current = window.setTimeout(() => setSeekBadge(null), 650);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (pipSession) closePip();
      v.play().catch(() => {});
      scheduleHideControls(true);
    } else {
      v.pause();
      scheduleHideControls(false);
    }
  };

  // Keep inline video paused if an in-app PiP session is active
  useEffect(() => {
    if (pipSession && videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
    }
  }, [pipSession]);

  const latestInlineSnapshotRef = useRef({
    autoPip: state.playerPrefs.autoPip,
    media,
    episodes,
    safeIndex,
    sourceId,
    serverId: selectedServer?.id,
    currentTime,
    duration,
    playing,
    speed,
    muted,
    activeSubLang,
    editedCuesMap,
  });
  latestInlineSnapshotRef.current = {
    autoPip: state.playerPrefs.autoPip,
    media,
    episodes,
    safeIndex,
    sourceId,
    serverId: selectedServer?.id,
    currentTime,
    duration,
    playing,
    speed,
    muted,
    activeSubLang,
    editedCuesMap,
  };

  // Auto-enter PiP if user leaves Watch view / DetailsPage while inline video is actively playing
  useEffect(() => {
    const videoEl = videoRef.current;
    return () => {
      const elapsed =
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
        mountedAtRef.current;
      if (elapsed < 250 || isPipActive()) return;
      const snap = latestInlineSnapshotRef.current;
      const v = videoEl ?? videoRef.current;
      const isActivelyPlaying = snap.playing || Boolean(v && !v.paused && !v.ended);
      if (
        !shouldAutoEnterPipOnLeave({
          enabled: snap.autoPip,
          isPlaying: isActivelyPlaying,
          ended: Boolean(v?.ended),
          alreadyHandled: handledPipExitRef.current,
        })
      ) {
        return;
      }
      handledPipExitRef.current = true;
      const ep = snap.episodes[snap.safeIndex] ?? snap.episodes[0];
      const liveTime = v?.currentTime ?? snap.currentTime;
      const liveDur = getEffectiveDurationSeconds(
        v?.duration || snap.duration,
        ep?.durationSeconds,
        snap.media.duration,
      );
      if (v && !v.paused) {
        v.pause();
      }
      enterInAppPip({
        media: snap.media,
        episodes: snap.episodes,
        episodeIndex: snap.safeIndex,
        sourceId: snap.sourceId,
        serverId: snap.serverId,
        currentTime: liveTime,
        duration: liveDur,
        playing: true,
        speed: snap.speed,
        muted: snap.muted,
        volume: v?.volume ?? 1,
        activeSubLang: snap.activeSubLang,
        editedCuesMap: snap.editedCuesMap,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEnterPip = () => {
    handledPipExitRef.current = true;
    const v = videoRef.current;
    const liveTime = v?.currentTime ?? currentTime;
    const liveDur = getEffectiveDurationSeconds(
      v?.duration || duration,
      currentEpisode.durationSeconds,
      media.duration,
    );
    const livePlaying = v ? !v.paused : playing;
    if (v && !v.paused) {
      v.pause();
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setShowServerMenu(false);
    setShowSettingsMenu(false);
    setShowEpisodeDrawer(false);
    enterInAppPip({
      media,
      episodes,
      episodeIndex: safeIndex,
      sourceId,
      serverId: selectedServer?.id,
      currentTime: liveTime,
      duration: liveDur,
      playing: livePlaying,
      speed,
      muted,
      volume: v?.volume ?? 1,
      activeSubLang,
      editedCuesMap,
    });
  };

  const toggleNativePiP = async () => {
    const v = videoRef.current;
    if (!canUseNativePictureInPicture(document, v) || !v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await v.requestPictureInPicture();
      }
    } catch {
      // Ignore PiP rejection in sandboxed iframes
    }
  };

  const seekBy = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    const totalDur = getEffectiveDurationSeconds(
      v.duration || duration,
      currentEpisode.durationSeconds,
      media.duration,
    );
    const next = clampSeekTarget(v.currentTime, delta, totalDur);
    v.currentTime = next;
    setCurrentTime(next);
    triggerSeekFeedback(delta);
    scheduleHideControls();
  };

  const toggleFullscreen = async () => {
    if (!playerContainerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await playerContainerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      onOpenFullPlayer?.(safeIndex);
    }
  };

  const handleSelectHlsLevel = (levelIndex: number, qualityPref?: VideoQualityPref) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
    }
    setSelectedHlsLevel(levelIndex);
    if (qualityPref) {
      updatePlayerPrefs({ defaultQuality: qualityPref });
    }
  };

  const effectiveDuration = getEffectiveDurationSeconds(
    duration,
    currentEpisode.durationSeconds,
    media.duration,
  );
  const progressPercent = formatScrubberPercent(currentTime, effectiveDuration);
  const backdropArtwork = currentEpisode.thumbnail || media.banner || media.cover || '';
  const animeTitle = getPreferredTitle(media.title, state.contentPrefs.titlePreference);
  const controlsVisible =
    showControls || !playing || showServerMenu || showSettingsMenu || showEpisodeDrawer;

  const activeQualityLabel = useMemo(() => {
    if (hlsQualityOptions.length > 1) {
      const found = hlsQualityOptions.find((o) => o.index === selectedHlsLevel);
      if (found) return found.label;
    }
    return state.playerPrefs.defaultQuality.toUpperCase();
  }, [hlsQualityOptions, selectedHlsLevel, state.playerPrefs.defaultQuality]);

  return (
    <section
      data-testid="inline-anime-player"
      aria-label={`Inline player for ${animeTitle}`}
      className="sx-player-stage-enter relative mb-5"
    >
      {/* Ambient Aura Glow Effect around the Player when Anime Plays */}
      <div
        data-testid="inline-player-ambient"
        data-playing={playing ? 'true' : 'false'}
        aria-hidden="true"
        className={`pointer-events-none absolute -inset-4 sm:-inset-7 -z-10 transition-all duration-700 ${
          ambientEnabled
            ? playing
              ? 'opacity-80 scale-[1.03]'
              : 'opacity-25 scale-[0.98]'
            : 'opacity-0'
        }`}
      >
        {backdropArtwork && (
          <img
            src={backdropArtwork}
            alt=""
            className={`w-full h-full object-cover rounded-[42px] blur-3xl saturate-150 transition-transform duration-1000 ${
              playing ? 'animate-pulse' : ''
            }`}
            style={{ animationDuration: '4.8s' }}
          />
        )}

        <canvas
          ref={ambientCanvasRef}
          width={32}
          height={18}
          className={`absolute inset-0 w-full h-full rounded-[42px] blur-3xl saturate-150 transition-opacity duration-500 ${
            playing && hasVideoFrame ? 'opacity-85' : 'opacity-0'
          }`}
        />

        <div
          className={`absolute -inset-2 rounded-[40px] blur-2xl transition-opacity duration-700 ${
            playing ? 'opacity-65' : 'opacity-20'
          }`}
          style={{
            background:
              'radial-gradient(circle at 20% 35%, color-mix(in srgb, var(--sx-primary) 42%, transparent), transparent 58%), radial-gradient(circle at 82% 70%, color-mix(in srgb, var(--sx-tertiary) 28%, transparent), transparent 55%)',
          }}
        />
      </div>

      {/* Rounded 16:9 Inline Video Stage (becomes full black cinema stage in fullscreen) */}
      <div
        ref={playerContainerRef}
        onMouseMove={() => scheduleHideControls()}
        onTouchStart={() => scheduleHideControls()}
        style={{ borderRadius: isFullscreen ? '0px' : `${state.themePrefs.uiRoundness}px` }}
        className={`relative w-full bg-black text-white border border-white/25 dark:border-white/15 select-none transition-shadow duration-700 ${
          isFullscreen ? 'h-full overflow-hidden' : 'aspect-video'
        } ${
          playing && ambientEnabled && !isFullscreen
            ? 'shadow-[0_18px_52px_-12px_rgba(0,0,0,0.65),0_0_46px_-8px_color-mix(in srgb,var(--sx-primary)_45%,transparent)]'
            : 'shadow-[0_14px_38px_rgba(15,23,42,0.28)]'
        }`}
      >
        {/* Inner Rounded Stage Clipping Wrapper (clips video/vignette/drawer without clipping settings popover) */}
        <div
          style={{ borderRadius: isFullscreen ? '0px' : `${state.themePrefs.uiRoundness}px` }}
          className="absolute inset-0 overflow-hidden flex items-center justify-center bg-black"
        >
          {/* Uncropped Artwork Preview + Blurred Ambient Fill ONLY before first video frame loads */}
          {backdropArtwork && (
            <>
              <img
                src={backdropArtwork}
                alt=""
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 w-full h-full object-cover blur-2xl scale-110 transition-opacity duration-500 ${
                  hasVideoFrame || isFullscreen ? 'opacity-0' : 'opacity-45'
                }`}
              />
              <img
                src={backdropArtwork}
                alt={currentEpisode.title}
                className={`pointer-events-none absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ${
                  hasVideoFrame || isFullscreen ? 'opacity-0' : 'opacity-80'
                }`}
              />
            </>
          )}
          {!hasVideoFrame && !isFullscreen && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden"
            >
              <div
                className="absolute inset-0 opacity-55"
                style={{
                  background:
                    'radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--sx-player-accent) 26%, transparent), transparent 65%)',
                }}
              />
              <div className="sx-buffering-shimmer w-1/2 h-full bg-gradient-to-r from-transparent via-white/15 to-transparent skew-x-[-20deg]" />
              <div className="absolute top-12 sm:top-14 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-[10px] font-bold text-white/90 shadow-lg">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--sx-player-accent)] animate-ping" />
                <span>Preparing EP {currentEpisode.number}...</span>
              </div>
            </div>
          )}

          <video
            ref={videoRef}
            autoPlay={false}
            playsInline
            onClick={() => {
              if (showServerMenu || showSettingsMenu || showEpisodeDrawer) {
                setShowServerMenu(false);
                setShowSettingsMenu(false);
                setShowEpisodeDrawer(false);
                return;
              }
              togglePlay();
            }}
            onDoubleClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const isLeft = e.clientX - rect.left < rect.width / 2;
              seekBy(isLeft ? -10 : 10);
            }}
            onPlay={() => {
              setPlaying(true);
              scheduleHideControls(true);
            }}
            onPause={() => {
              setPlaying(false);
              setShowControls(true);
            }}
            onLoadedData={() => setHasVideoFrame(true)}
            onPlaying={() => setHasVideoFrame(true)}
            onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
            onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
            onEnded={() => {
              if (autoNext && navState.hasNext) {
                onChangeEpisodeIndex(navState.nextIndex);
              } else {
                setPlaying(false);
                setShowControls(true);
              }
            }}
            className={`relative z-10 w-full h-full max-w-full max-h-full ${getVideoFitClass(
              fitMode,
            )} transition-opacity duration-300 ${hasVideoFrame ? 'opacity-100' : 'opacity-0'}`}
          />

          {/* Subtle Dark Legibility Vignette when controls are shown */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/70 via-black/15 to-black/45 transition-opacity duration-300 ${
              controlsVisible ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Double-tap Seek Radial Ripple & HUD */}
          {seekBadge && (
            <>
              <div
                key={`ripple-${seekBadge.seq}`}
                aria-hidden="true"
                className={`pointer-events-none absolute inset-y-0 w-1/2 z-20 ${
                  seekBadge.side === 'left'
                    ? 'left-0 sx-seek-ripple-left bg-gradient-to-r from-white/20 via-white/10 to-transparent rounded-r-full'
                    : 'right-0 sx-seek-ripple-right bg-gradient-to-l from-white/20 via-white/10 to-transparent rounded-l-full'
                }`}
              />
              <div
                key={`badge-${seekBadge.seq}`}
                className={`sx-player-badge-pop pointer-events-none absolute top-1/2 z-30 px-3.5 py-1.5 rounded-full bg-black/70 backdrop-blur-xl border border-white/20 text-xs font-black tracking-wide shadow-xl ${
                  seekBadge.side === 'left' ? 'left-5 sm:left-10' : 'right-5 sm:right-10'
                }`}
              >
                {seekBadge.label}
              </div>
            </>
          )}

          {/* Active Subtitle Cue (positioned cleanly so it never collides with center controls on mobile) */}
          {activeCue && (
            <div
              data-testid="inline-player-subtitle-overlay"
              className={`pointer-events-none absolute inset-x-3 sm:inset-x-5 flex justify-center z-20 transition-all duration-200 ${
                state.playerPrefs.subtitlePosition === 'top'
                  ? 'top-12 sm:top-14'
                  : controlsVisible
                    ? isFullscreen
                      ? 'bottom-16'
                      : 'bottom-[44px] sm:bottom-14'
                    : 'bottom-3 sm:bottom-6'
              }`}
            >
              <p
                key={activeCue.text}
                style={{
                  fontSize: `${
                    isFullscreen
                      ? state.playerPrefs.subtitleSize
                      : Math.min(state.playerPrefs.subtitleSize, 10)
                  }px`,
                  color: state.playerPrefs.subtitleColor || '#ffffff',
                }}
                className={`sx-player-subtitle-enter px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-xl text-center font-bold max-w-[94%] sm:max-w-lg leading-tight sm:leading-snug ${
                  !isFullscreen && controlsVisible ? 'line-clamp-1 sm:line-clamp-2' : 'line-clamp-2'
                } transition-all duration-200 ${
                  state.playerPrefs.subtitleBackground
                    ? 'bg-black/75 backdrop-blur-md border border-white/10'
                    : 'drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]'
                }`}
              >
                {activeCue.text}
              </p>
            </div>
          )}

          {/* Controls Overlay */}
          <div
            className={`sx-player-controls-fade absolute inset-0 z-20 flex flex-col justify-between p-2.5 sm:p-3.5 pointer-events-none ${
              controlsVisible ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {/* Top Overlay Row: Cast/Server Left · Episode Tag · Episode List + Settings Right */}
            <div
              className={`pointer-events-auto relative flex items-center justify-between gap-2 transition-transform duration-300 ${
                controlsVisible ? 'translate-y-0' : '-translate-y-2'
              }`}
            >
              <button
                type="button"
                aria-label="Stream server and cast"
                data-testid="inline-player-cast-btn"
                onClick={() => {
                  setShowServerMenu((v) => !v);
                  setShowSettingsMenu(false);
                  setShowEpisodeDrawer(false);
                }}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-black/40 hover:bg-black/65 backdrop-blur-md border border-white/15 flex items-center justify-center transition-colors shrink-0"
              >
                <Cast className="w-4 h-4 text-white" />
              </button>

              <span
                key={`ep-pill-${currentEpisode.id}`}
                className={`${epBadgeAnimClass} px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[10px] sm:text-[11px] font-bold tracking-wide text-white/95 truncate max-w-[48%] sm:max-w-[56%]`}
              >
                EP {currentEpisode.number} · {currentEpisode.title}
              </span>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  aria-label="Picture in Picture"
                  title="Picture in Picture (continue watching while browsing)"
                  data-testid="inline-player-pip-btn"
                  onClick={handleEnterPip}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-black/40 hover:bg-black/65 backdrop-blur-md border border-white/15 flex items-center justify-center text-white transition-colors"
                >
                  <PictureInPicture2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  aria-label="Episode list"
                  data-testid="inline-player-episodes-btn"
                  onClick={() => {
                    setShowEpisodeDrawer((v) => !v);
                    setShowSettingsMenu(false);
                    setShowServerMenu(false);
                  }}
                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full backdrop-blur-md border flex items-center justify-center transition-colors ${
                    showEpisodeDrawer
                      ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] border-[var(--sx-player-accent)]'
                      : 'bg-black/40 hover:bg-black/65 border-white/15 text-white'
                  }`}
                >
                  <ListVideo className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  aria-label="Player settings"
                  data-testid="inline-player-settings-btn"
                  onClick={() => {
                    setShowSettingsMenu((v) => !v);
                    setShowServerMenu(false);
                    setShowEpisodeDrawer(false);
                  }}
                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full backdrop-blur-md border flex items-center justify-center transition-transform duration-300 ${
                    showSettingsMenu
                      ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] border-[var(--sx-player-accent)] rotate-45'
                      : 'bg-black/40 hover:bg-black/65 border-white/15 text-white'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Center Playback Cluster (-10s · Play/Pause · +10s) — lifted slightly on mobile when controls & subtitles show */}
            <div
              className={`flex items-center justify-center gap-6 sm:gap-10 transition-all duration-300 ${
                showSettingsMenu || showServerMenu || showEpisodeDrawer
                  ? 'opacity-0 scale-90 pointer-events-none'
                  : 'pointer-events-auto'
              } ${
                !isFullscreen && controlsVisible ? '-translate-y-3.5 sm:translate-y-0' : ''
              } ${controlsVisible ? 'scale-100' : 'scale-95'}`}
            >
              <button
                type="button"
                aria-label="Rewind 10 seconds"
                onClick={() => seekBy(-10)}
                className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full hover:bg-white/15 flex items-center justify-center transition-all active:scale-90"
              >
                <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6 text-white drop-shadow" />
                <span className="absolute text-[8px] sm:text-[9px] font-black mt-0.5 text-white tabular-nums">
                  10
                </span>
              </button>

              <button
                type="button"
                aria-label={playing ? 'Pause playback' : 'Play playback'}
                data-testid="inline-player-play-btn"
                onClick={togglePlay}
                className="sx-player-play-btn w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-white/18 hover:bg-white/28 backdrop-blur-md border border-white/25 flex items-center justify-center shadow-2xl"
              >
                {playing ? (
                  <Pause
                    key="pause-icon"
                    className="sx-player-icon-pop w-5 h-5 sm:w-7 sm:h-7 fill-white text-white"
                  />
                ) : (
                  <Play
                    key="play-icon"
                    className="sx-player-icon-pop w-5 h-5 sm:w-7 sm:h-7 fill-white text-white ml-0.5"
                  />
                )}
              </button>

              <button
                type="button"
                aria-label="Forward 10 seconds"
                onClick={() => seekBy(10)}
                className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full hover:bg-white/15 flex items-center justify-center transition-all active:scale-90"
              >
                <RotateCw className="w-5 h-5 sm:w-6 sm:h-6 text-white drop-shadow" />
                <span className="absolute text-[8px] sm:text-[9px] font-black mt-0.5 text-white tabular-nums">
                  10
                </span>
              </button>
            </div>

            {/* Bottom Frosted Floating Scrubber Pill — hidden while popovers/drawer are open */}
            <div
              className={`space-y-2 transition-all duration-300 ${
                showSettingsMenu || showServerMenu || showEpisodeDrawer
                  ? 'opacity-0 translate-y-2 pointer-events-none'
                  : 'pointer-events-auto'
              } ${controlsVisible ? 'translate-y-0' : 'translate-y-2'}`}
            >
              {activeSkip && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.currentTime = activeSkip.endTime;
                        setCurrentTime(activeSkip.endTime);
                      }
                    }}
                    className="sx-player-skip-pill inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-black text-[11px] font-extrabold shadow-lg hover:bg-[var(--sx-player-accent)] hover:text-[var(--sx-player-on-accent)] transition-colors"
                  >
                    <FastForward className="w-3.5 h-3.5" />
                    <span>Skip {activeSkip.skipType.toUpperCase()}</span>
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2.5 px-3.5 py-1.5 sm:py-2 rounded-full bg-black/50 backdrop-blur-xl border border-white/15 shadow-lg">
                <span className="text-[11px] font-bold text-white/95 tabular-nums shrink-0">
                  {formatPlayerTime(currentTime)}
                </span>

                <div className="group/scrubber relative flex-1 flex items-center h-4">
                  <div className="w-full h-1 rounded-full bg-white/25 overflow-hidden">
                    <div
                      style={{ width: `${progressPercent}%` }}
                      className="h-full rounded-full bg-[var(--sx-player-accent)] transition-[width] duration-150"
                    />
                  </div>
                  <span
                    aria-hidden="true"
                    style={{ left: `calc(${progressPercent}% - 5px)` }}
                    className="pointer-events-none absolute w-2.5 h-2.5 rounded-full bg-white ring-2 ring-[var(--sx-player-accent)] shadow-md transition-transform duration-150 group-hover/scrubber:scale-125"
                  />
                  <input
                    type="range"
                    aria-label="Seek video timeline"
                    min={0}
                    max={effectiveDuration}
                    step={0.5}
                    value={Math.min(currentTime, effectiveDuration)}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (videoRef.current) videoRef.current.currentTime = next;
                      setCurrentTime(next);
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>

                <span className="text-[11px] font-bold text-white/85 tabular-nums shrink-0">
                  {formatPlayerTime(effectiveDuration)}
                </span>

                <button
                  type="button"
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen player'}
                  data-testid="inline-player-fullscreen-btn"
                  onClick={toggleFullscreen}
                  className="w-6 h-6 rounded-full hover:bg-white/15 flex items-center justify-center text-white/90 shrink-0 transition-colors"
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-3.5 h-3.5" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Slide-over Episode List Drawer inside Player Stage */}
          <PlayerEpisodeDrawer
            open={showEpisodeDrawer}
            episodes={episodes}
            activeIndex={safeIndex}
            compact={!isFullscreen}
            onSelectEpisode={(idx) => onChangeEpisodeIndex(idx)}
            onClose={() => setShowEpisodeDrawer(false)}
          />
        </div>

        {/* Server Popover (z-40 above controls & never clipped in inline mode) */}
        {showServerMenu && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="sx-player-popover absolute top-11 left-2.5 z-40 w-56 rounded-2xl bg-zinc-950/95 backdrop-blur-2xl border border-white/15 p-2 space-y-1 shadow-2xl"
          >
            <p className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white/60">
              Stream Mirror ({activeQualityLabel})
            </p>
            {servers.map((srv) => {
              const active = srv.id === selectedServer?.id;
              return (
                <button
                  key={srv.id}
                  type="button"
                  onClick={() => {
                    setSelectedServer(srv);
                    setShowServerMenu(false);
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-xl text-left text-[11px] font-bold flex items-center justify-between transition-colors ${
                    active
                      ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)]'
                      : 'text-white/90 hover:bg-white/10'
                  }`}
                >
                  <span>{srv.name}</span>
                  <span className="text-[9px] uppercase opacity-75">{srv.category}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Shared Settings Popover (Playback, Quality, Subtitle Editor) — z-40 & unclipped */}
        <PlayerSettingsPopover
          open={showSettingsMenu}
          onClose={() => setShowSettingsMenu(false)}
          playerPrefs={state.playerPrefs}
          onUpdatePrefs={updatePlayerPrefs}
          speed={speed}
          onChangeSpeed={setSpeed}
          muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
          hlsQualityOptions={hlsQualityOptions}
          selectedHlsLevel={selectedHlsLevel}
          onSelectHlsLevel={handleSelectHlsLevel}
          servers={servers}
          selectedServerId={selectedServer?.id}
          onSelectServer={(srv) => setSelectedServer(srv)}
          subtitleTracks={
            stream.subtitles?.map((s) => ({ lang: s.lang, label: s.label })) || [
              { lang: 'en', label: 'English' },
            ]
          }
          activeSubLang={activeSubLang}
          onChangeSubLang={(lang) => setActiveSubLang(lang === 'ja' ? 'ja' : 'en')}
          cues={effectiveCues}
          currentTime={currentTime}
          onUpdateCues={(nextCues) =>
            setEditedCuesMap((prev) => ({ ...prev, [trackKey]: nextCues }))
          }
          onResetCues={() =>
            setEditedCuesMap((prev) => {
              const copy = { ...prev };
              delete copy[trackKey];
              return copy;
            })
          }
          ambientEnabled={ambientEnabled}
          onToggleAmbient={() => setAmbientEnabled((v) => !v)}
          onToggleNativePip={
            canUseNativePictureInPicture(
              typeof document !== 'undefined' ? document : null,
              videoRef.current,
            )
              ? () => void toggleNativePiP()
              : undefined
          }
          onOpenEpisodes={() => {
            setShowSettingsMenu(false);
            setShowEpisodeDrawer(true);
          }}
          episodeCount={episodes.length}
          onOpenFullPlayer={
            onOpenFullPlayer
              ? () => {
                  handledPipExitRef.current = true;
                  onOpenFullPlayer(safeIndex);
                }
              : undefined
          }
          compact={!isFullscreen}
        />
      </div>

      {/* Episode Navigation & Auto Controls Bar Below Player (responsive across all viewports) */}
      <div
        data-testid="inline-player-controls-bar"
        className="mt-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-y-2 gap-x-1.5 sm:gap-2"
      >
        <button
          type="button"
          data-testid="inline-player-prev-btn"
          disabled={!navState.hasPrev}
          onClick={() => onChangeEpisodeIndex(navState.prevIndex)}
          className="order-1 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-extrabold text-[var(--sx-on-surface)] hover:text-[var(--sx-primary)] disabled:opacity-35 disabled:pointer-events-none transition-colors shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Prev</span>
        </button>

        <span className="order-2 sm:hidden text-[11px] font-extrabold text-[var(--sx-on-surface-muted)] tabular-nums">
          EP {currentEpisode.number} / {episodes.length || 1}
        </span>

        <div className="order-4 sm:order-2 w-full sm:w-auto sm:flex-1 min-w-0 grid grid-cols-3 sm:flex sm:flex-wrap items-center sm:justify-center gap-1.5 sm:gap-2">
          <button
            type="button"
            data-testid="toggle-auto-play"
            aria-pressed={autoPlay}
            onClick={() => updatePlayerPrefs({ autoPlay: !autoPlay })}
            className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-full backdrop-blur-lg border text-[10px] sm:text-[11px] font-bold whitespace-nowrap transition-all ${
              autoPlay
                ? 'bg-[var(--sx-surface-container)]/45 dark:bg-white/12 border-[var(--sx-primary)]/45 text-[var(--sx-on-surface)] shadow-sm'
                : 'bg-[var(--sx-surface-container)]/22 dark:bg-white/5 border-white/30 dark:border-white/10 text-[var(--sx-on-surface-muted)]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                autoPlay
                  ? 'bg-[var(--sx-primary)] shadow-[0_0_8px_var(--sx-primary)]'
                  : 'bg-[var(--sx-on-surface-muted)]/60'
              }`}
            />
            <span className="truncate">Auto Play</span>
          </button>

          <button
            type="button"
            data-testid="toggle-auto-next"
            aria-pressed={autoNext}
            onClick={() => updatePlayerPrefs({ autoNextEpisode: !autoNext })}
            className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-full backdrop-blur-lg border text-[10px] sm:text-[11px] font-bold whitespace-nowrap transition-all ${
              autoNext
                ? 'bg-[var(--sx-surface-container)]/45 dark:bg-white/12 border-[var(--sx-primary)]/45 text-[var(--sx-on-surface)] shadow-sm'
                : 'bg-[var(--sx-surface-container)]/22 dark:bg-white/5 border-white/30 dark:border-white/10 text-[var(--sx-on-surface-muted)]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                autoNext
                  ? 'bg-[var(--sx-primary)] shadow-[0_0_8px_var(--sx-primary)]'
                  : 'bg-[var(--sx-on-surface-muted)]/60'
              }`}
            />
            <span className="truncate">Auto Next</span>
          </button>

          <button
            type="button"
            data-testid="toggle-auto-skip"
            aria-pressed={autoSkip}
            onClick={() => updatePlayerPrefs({ autoSkipOp: !autoSkip, autoSkipEd: !autoSkip })}
            className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-full backdrop-blur-lg border text-[10px] sm:text-[11px] font-bold whitespace-nowrap transition-all ${
              autoSkip
                ? 'bg-[var(--sx-surface-container)]/45 dark:bg-white/12 border-[var(--sx-primary)]/45 text-[var(--sx-on-surface)] shadow-sm'
                : 'bg-[var(--sx-surface-container)]/22 dark:bg-white/5 border-white/30 dark:border-white/10 text-[var(--sx-on-surface-muted)]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                autoSkip
                  ? 'bg-[var(--sx-primary)] shadow-[0_0_8px_var(--sx-primary)]'
                  : 'bg-[var(--sx-on-surface-muted)]/60'
              }`}
            />
            <span className="truncate">Auto Skip</span>
          </button>
        </div>

        <button
          type="button"
          data-testid="inline-player-next-btn"
          disabled={!navState.hasNext}
          onClick={() => onChangeEpisodeIndex(navState.nextIndex)}
          className="order-3 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-extrabold text-[var(--sx-on-surface)] hover:text-[var(--sx-primary)] disabled:opacity-35 disabled:pointer-events-none transition-colors shrink-0"
        >
          <span>Next</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </section>
  );
};
