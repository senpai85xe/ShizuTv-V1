import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Hls from 'hls.js';
import {
  ArrowLeft,
  FastForward,
  Keyboard,
  ListVideo,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RectangleHorizontal,
  RotateCcw,
  RotateCw,
  Server,
  Settings,
  SkipBack,
  SkipForward,
  Subtitles,
  Sun,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useApp, VideoFitMode, VideoQualityPref } from '../store/AppContext';
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
  findActiveSubtitleCue,
  getVideoFitClass,
  HlsQualityOption,
  resolvePreferredHlsLevel,
  shouldAutoStartPlayback,
  SubtitleCue,
} from '../utils/inlinePlayer';
import {
  computeSwipeSeekTarget,
  computeSwipeVerticalLevel,
  detectPlayerGestureKind,
  formatSignedSeekDelta,
  PlayerGestureKind,
} from '../utils/playerGestures';
import {
  canUseNativePictureInPicture,
  shouldAutoEnterPipOnLeave,
} from '../utils/pipPlayer';
import { PlayerEpisodeDrawer } from '../components/PlayerEpisodeDrawer';
import { PlayerSettingsPopover } from '../components/PlayerSettingsPopover';
import {
  EpisodeChangeDirection,
  getEpisodeBadgeTransitionClass,
  getEpisodeChangeDirection,
} from '../utils/detailsMotion';

interface PlayerLocationState {
  media?: UnifiedMedia;
  episodes?: UnifiedEpisode[];
  episodeIndex?: number;
  sourceId?: string;
  serverId?: string;
  startTime?: number;
  resumePlaying?: boolean;
  activeSubLang?: 'en' | 'ja';
  editedCuesMap?: Record<string, SubtitleCue[]>;
}

export const PlayerPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, updatePlayerPrefs, recordHistory, upsertLibraryEntry, getLibraryEntry } = useApp();
  const { pipSession, enterInAppPip, closePip } = usePip();

  const routeState = (location.state as PlayerLocationState | null) || {};
  const media: UnifiedMedia = routeState.media ?? {
    id: 'demo-anime',
    type: 'ANIME',
    title: { english: 'ShizuTv Stream Preview' },
  };
  const episodes: UnifiedEpisode[] =
    routeState.episodes && routeState.episodes.length > 0
      ? routeState.episodes
      : [{ id: 'ep-1', number: 1, title: 'Episode 1' }];

  const [epIndex, setEpIndex] = useState(routeState.episodeIndex ?? 0);
  const currentEpisode = episodes[epIndex] ?? episodes[0];

  const servers = useMemo(() => resolveVideoServers(routeState.sourceId), [routeState.sourceId]);
  const [selectedServer, setSelectedServer] = useState<VideoServer>(
    () => servers.find((s) => s.id === routeState.serverId) ?? servers[0],
  );
  const stream = useMemo(
    () => resolveVideoStream(media, currentEpisode, selectedServer),
    [media, currentEpisode, selectedServer],
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const seekFeedbackTimerRef = useRef<number | null>(null);
  const pendingStartTimeRef = useRef<number | null>(
    typeof routeState.startTime === 'number' && routeState.startTime > 0
      ? routeState.startTime
      : null,
  );
  const pendingResumePlayRef = useRef<boolean>(Boolean(routeState.resumePlaying));
  const handledPipExitRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [hasVideoFrame, setHasVideoFrame] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [speed, setSpeed] = useState(state.playerPrefs.defaultSpeed || 1);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeSubLang, setActiveSubLang] = useState<'en' | 'ja'>(
    routeState.activeSubLang || 'en',
  );
  const [editedCuesMap, setEditedCuesMap] = useState<Record<string, SubtitleCue[]>>(
    routeState.editedCuesMap || {},
  );
  const [hlsQualityOptions, setHlsQualityOptions] = useState<HlsQualityOption[]>([
    { index: -1, label: 'Auto' },
  ]);
  const [selectedHlsLevel, setSelectedHlsLevel] = useState<number>(-1);

  const [seekBadge, setSeekBadge] = useState<{ label: string; side: 'left' | 'right'; seq: number } | null>(
    null,
  );
  const seekSeqRef = useRef(0);
  const [epTransition, setEpTransition] = useState<{ index: number; dir: EpisodeChangeDirection }>({
    index: epIndex,
    dir: 'none',
  });
  if (epTransition.index !== epIndex) {
    setEpTransition({
      index: epIndex,
      dir: getEpisodeChangeDirection(epTransition.index, epIndex),
    });
  }
  const epBadgeAnimClass = getEpisodeBadgeTransitionClass(epTransition.dir);
  const [gestureSeekState, setGestureSeekState] = useState<{
    targetTime: number;
    deltaSeconds: number;
  } | null>(null);
  const [volumeHudVisible, setVolumeHudVisible] = useState(false);
  const [brightnessHudVisible, setBrightnessHudVisible] = useState(false);

  const hudHideTimerRef = useRef<number | null>(null);
  const suppressNextClickRef = useRef(false);
  const gestureSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    localStartX: number;
    containerWidth: number;
    startTime: number;
    startVolume: number;
    startBrightness: number;
    lockedKind: PlayerGestureKind;
    hasMoved: boolean;
  } | null>(null);

  const [showEpisodeDrawer, setShowEpisodeDrawer] = useState(false);
  const [showServerMenu, setShowServerMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [skipIntervals, setSkipIntervals] = useState<SkipInterval[]>([]);

  const autoPlay = state.playerPrefs.autoPlay;
  const fitMode: VideoFitMode = state.playerPrefs.videoFit || 'contain';
  const subtitlesOn = state.playerPrefs.subtitleEnabled;

  // Close floating PiP session if user opened dedicated PlayerPage
  useEffect(() => {
    if (pipSession) {
      closePip();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attach HLS or native MP4 stream — strictly respects persisted autoPlay preference and PiP restore timestamp
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    const resumeAt = pendingStartTimeRef.current;
    const resumePlay = pendingResumePlayRef.current;
    pendingStartTimeRef.current = null;
    pendingResumePlayRef.current = false;

    setHasVideoFrame(false);
    setPlaying(false);
    setCurrentTime(resumeAt ?? 0);
    setDuration(0);
    setHlsQualityOptions([{ index: -1, label: 'Auto' }]);
    setSelectedHlsLevel(-1);

    const shouldStart = shouldAutoStartPlayback(autoPlay, resumePlay);
    video.autoplay = false;

    const applyInitialStreamState = () => {
      if (cancelled) return;
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
        if (!hls) return;
        setHlsQualityOptions(buildHlsQualityOptions(hls.levels));
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

  // Fetch AniSkip intervals for current episode
  useEffect(() => {
    setSkipIntervals([]);
    fetchAniSkipIntervals(media.idMal, currentEpisode.number).then(setSkipIntervals);
  }, [media.idMal, currentEpisode.number]);

  // Record Watch History & update library progress if watching
  useEffect(() => {
    recordHistory({
      mediaId: media.id,
      mediaType: media.type,
      media,
      episodeNumber: currentEpisode.number,
      episodeTitle: currentEpisode.title,
      positionSeconds: Math.floor(currentTime),
      durationSeconds: Math.floor(duration || 1440),
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
  }, [epIndex]);

  const scheduleHideControls = (currentlyPlaying = playing) => {
    setShowControls(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (
      currentlyPlaying &&
      !showEpisodeDrawer &&
      !showServerMenu &&
      !showSettingsMenu &&
      !showShortcuts
    ) {
      hideTimerRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 3200);
    }
  };

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
      v.play().catch(() => {});
      scheduleHideControls(true);
    } else {
      v.pause();
      scheduleHideControls(false);
    }
  };

  const seekBy = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    const next = clampSeekTarget(v.currentTime, delta, v.duration || duration || 1440);
    v.currentTime = next;
    setCurrentTime(next);
    triggerSeekFeedback(delta);
    scheduleHideControls();
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
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

  const latestSnapshotRef = useRef({
    autoPip: state.playerPrefs.autoPip,
    media,
    episodes,
    epIndex,
    sourceId: routeState.sourceId,
    serverId: selectedServer.id,
    currentTime,
    duration,
    playing,
    speed,
    muted,
    volume,
    activeSubLang,
    editedCuesMap,
  });
  latestSnapshotRef.current = {
    autoPip: state.playerPrefs.autoPip,
    media,
    episodes,
    epIndex,
    sourceId: routeState.sourceId,
    serverId: selectedServer.id,
    currentTime,
    duration,
    playing,
    speed,
    muted,
    volume,
    activeSubLang,
    editedCuesMap,
  };

  const enterPipAndBrowse = () => {
    handledPipExitRef.current = true;
    const v = videoRef.current;
    const liveTime = v?.currentTime ?? currentTime;
    const liveDuration = v?.duration || duration || (currentEpisode.durationSeconds ?? 1440);
    const livePlaying = v ? !v.paused : playing;
    if (v && !v.paused) {
      v.pause();
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    enterInAppPip({
      media,
      episodes,
      episodeIndex: epIndex,
      sourceId: routeState.sourceId,
      serverId: selectedServer.id,
      currentTime: liveTime,
      duration: liveDuration,
      playing: livePlaying,
      speed,
      muted,
      volume,
      activeSubLang,
      editedCuesMap,
    });
    if (location.key !== 'default') {
      navigate(-1);
    } else {
      navigate('/home');
    }
  };

  const handleLeavePlayer = () => {
    const v = videoRef.current;
    const isActivelyPlaying = Boolean(v && !v.paused) || playing;
    if (
      shouldAutoEnterPipOnLeave({
        enabled: state.playerPrefs.autoPip,
        isPlaying: isActivelyPlaying,
        ended: Boolean(v?.ended),
        alreadyHandled: handledPipExitRef.current,
      })
    ) {
      enterPipAndBrowse();
      return;
    }
    handledPipExitRef.current = true;
    if (location.key !== 'default') {
      navigate(-1);
    } else {
      navigate('/home');
    }
  };

  // Automatically enter PiP if user leaves /player (e.g. browser back/popstate or link) while actively playing
  useEffect(() => {
    const videoEl = videoRef.current;
    return () => {
      if (typeof window !== 'undefined' && window.location.pathname === '/player') {
        return;
      }
      const snap = latestSnapshotRef.current;
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
      const currentEp = snap.episodes[snap.epIndex] ?? snap.episodes[0];
      const liveTime = v?.currentTime ?? snap.currentTime;
      const liveDuration = v?.duration || snap.duration || currentEp?.durationSeconds || 1440;
      if (v && !v.paused) {
        v.pause();
      }
      enterInAppPip({
        media: snap.media,
        episodes: snap.episodes,
        episodeIndex: snap.epIndex,
        sourceId: snap.sourceId,
        serverId: snap.serverId,
        currentTime: liveTime,
        duration: liveDuration,
        playing: true,
        speed: snap.speed,
        muted: snap.muted,
        volume: snap.volume,
        activeSubLang: snap.activeSubLang,
        editedCuesMap: snap.editedCuesMap,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectHlsLevel = (levelIndex: number, qualityPref?: VideoQualityPref) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
    }
    setSelectedHlsLevel(levelIndex);
    if (qualityPref) {
      updatePlayerPrefs({ defaultQuality: qualityPref });
    }
  };

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      if (seekFeedbackTimerRef.current) window.clearTimeout(seekFeedbackTimerRef.current);
      if (hudHideTimerRef.current) window.clearTimeout(hudHideTimerRef.current);
    };
  }, []);

  const flashHudHide = () => {
    if (hudHideTimerRef.current) window.clearTimeout(hudHideTimerRef.current);
    hudHideTimerRef.current = window.setTimeout(() => {
      setVolumeHudVisible(false);
      setBrightnessHudVisible(false);
      setGestureSeekState(null);
    }, 900);
  };

  const applyVolumeLevel = (nextVol: number) => {
    const clamped = Math.max(0, Math.min(1, Math.round(nextVol * 100) / 100));
    setVolume(clamped);
    setMuted(clamped === 0);
    if (videoRef.current) {
      videoRef.current.volume = clamped;
      videoRef.current.muted = clamped === 0;
    }
    setVolumeHudVisible(true);
  };

  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (showEpisodeDrawer || showServerMenu || showSettingsMenu || showShortcuts) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, input, select, a, [data-no-gesture="true"]')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    gestureSessionRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      localStartX: e.clientX - rect.left,
      containerWidth: rect.width || window.innerWidth || 360,
      startTime: videoRef.current?.currentTime ?? currentTime,
      startVolume: muted ? 0 : volume,
      startBrightness: brightness,
      lockedKind: 'none',
      hasMoved: false,
    };
    suppressNextClickRef.current = false;
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = gestureSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    const dx = e.clientX - session.startX;
    const dy = e.clientY - session.startY;

    if (session.lockedKind === 'none') {
      const kind = detectPlayerGestureKind(dx, dy, session.localStartX, session.containerWidth);
      if (kind === 'none') return;
      session.lockedKind = kind;
      session.hasMoved = true;
      suppressNextClickRef.current = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture is unsupported
      }
    }

    if (hudHideTimerRef.current) window.clearTimeout(hudHideTimerRef.current);

    if (session.lockedKind === 'seek') {
      const effectiveDur = duration || videoRef.current?.duration || 1440;
      const preview = computeSwipeSeekTarget(
        session.startTime,
        dx,
        session.containerWidth,
        effectiveDur,
      );
      setGestureSeekState(preview);
    } else if (session.lockedKind === 'volume') {
      const nextVol = computeSwipeVerticalLevel(session.startVolume, dy, 220, 0, 1);
      applyVolumeLevel(nextVol);
    } else if (session.lockedKind === 'brightness') {
      const nextBright = computeSwipeVerticalLevel(session.startBrightness, dy, 220, 0.25, 1);
      setBrightness(nextBright);
      setBrightnessHudVisible(true);
    }
  };

  const handleStagePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = gestureSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;
    gestureSessionRef.current = null;

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore release failures
    }

    if (session.lockedKind === 'seek') {
      const dx = e.clientX - session.startX;
      const effectiveDur = duration || videoRef.current?.duration || 1440;
      const finalSeek = computeSwipeSeekTarget(
        session.startTime,
        dx,
        session.containerWidth,
        effectiveDur,
      );
      if (videoRef.current) {
        videoRef.current.currentTime = finalSeek.targetTime;
      }
      setCurrentTime(finalSeek.targetTime);
      setGestureSeekState(finalSeek);
      flashHudHide();
    } else if (session.lockedKind === 'volume' || session.lockedKind === 'brightness') {
      flashHudHide();
    }

    if (session.hasMoved) {
      window.setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 100);
    }
  };

  const handleStageWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (showEpisodeDrawer || showServerMenu || showSettingsMenu || showShortcuts) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('[data-no-gesture="true"]')) return;
    if (Math.abs(e.deltaY) < 2) return;
    const step = e.deltaY < 0 ? 0.05 : -0.05;
    applyVolumeLevel((muted ? 0 : volume) + step);
    flashHudHide();
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'arrowleft':
          seekBy(-10);
          break;
        case 'arrowright':
          seekBy(10);
          break;
        case 'arrowup':
          e.preventDefault();
          applyVolumeLevel((muted ? 0 : volume) + 0.05);
          flashHudHide();
          break;
        case 'arrowdown':
          e.preventDefault();
          applyVolumeLevel((muted ? 0 : volume) - 0.05);
          flashHudHide();
          break;
        case 'm':
          setMuted((m) => {
            if (videoRef.current) videoRef.current.muted = !m;
            return !m;
          });
          break;
        case 'f':
          void toggleFullscreen();
          break;
        case 'n':
          if (epIndex < episodes.length - 1) setEpIndex((i) => i + 1);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Active AniSkip interval
  const activeSkip = skipIntervals.find(
    (s) => currentTime >= s.startTime && currentTime < s.endTime - 0.5,
  );

  // Auto-skip OP/ED if enabled
  useEffect(() => {
    if (!activeSkip) return;
    if (
      (activeSkip.skipType === 'op' && state.playerPrefs.autoSkipOp) ||
      (activeSkip.skipType === 'ed' && state.playerPrefs.autoSkipEd)
    ) {
      if (videoRef.current) videoRef.current.currentTime = activeSkip.endTime;
    }
  }, [activeSkip, state.playerPrefs.autoSkipOp, state.playerPrefs.autoSkipEd]);

  // Active subtitle cue with live edits & sync offset
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

  const title = getPreferredTitle(media.title, state.contentPrefs.titlePreference);
  const backdropArtwork = currentEpisode.thumbnail || media.banner || media.cover || '';
  const effectiveDuration = duration || 1440;
  const progressRatio =
    effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;
  const gestureSeekRatio =
    gestureSeekState && effectiveDuration > 0
      ? Math.min(100, (gestureSeekState.targetTime / effectiveDuration) * 100)
      : progressRatio;
  const volumePercent = Math.round((muted ? 0 : volume) * 100);
  const brightnessPercent = Math.round(brightness * 100);
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
    <div
      ref={containerRef}
      data-testid="player-stage"
      onPointerDown={handleStagePointerDown}
      onPointerMove={handleStagePointerMove}
      onPointerUp={handleStagePointerEnd}
      onPointerCancel={handleStagePointerEnd}
      onWheel={handleStageWheel}
      onMouseMove={() => scheduleHideControls()}
      onTouchStart={() => scheduleHideControls()}
      className="sx-player-stage-enter relative w-full h-[100dvh] bg-black text-white overflow-hidden select-none flex items-center justify-center touch-none"
    >
      {backdropArtwork && (
        <img
          src={backdropArtwork}
          alt=""
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 w-full h-full object-cover blur-md scale-105 transition-opacity duration-500 ${
            hasVideoFrame ? 'opacity-0' : 'opacity-40'
          }`}
        />
      )}
      {!hasVideoFrame && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden z-[1]"
        >
          <div
            className="absolute inset-0 opacity-60"
            style={{
              background:
                'radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--sx-player-accent) 24%, transparent), transparent 65%)',
            }}
          />
          <div className="sx-buffering-shimmer w-1/2 h-full bg-gradient-to-r from-transparent via-white/15 to-transparent skew-x-[-20deg]" />
          <div className="absolute top-20 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-[11px] font-bold text-white/90 shadow-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--sx-player-accent)] animate-ping" />
            <span>Preparing EP {currentEpisode.number}...</span>
          </div>
        </div>
      )}
      <video
        ref={videoRef}
        autoPlay={false}
        playsInline
        style={brightness < 1 ? { filter: `brightness(${brightness})` } : undefined}
        onClick={() => {
          if (showServerMenu || showSettingsMenu || showEpisodeDrawer) {
            setShowServerMenu(false);
            setShowSettingsMenu(false);
            setShowEpisodeDrawer(false);
            return;
          }
          if (suppressNextClickRef.current) {
            suppressNextClickRef.current = false;
            return;
          }
          togglePlay();
        }}
        onDoubleClick={(e) => {
          if (suppressNextClickRef.current) return;
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
          if (state.playerPrefs.autoNextEpisode && epIndex < episodes.length - 1) {
            setEpIndex((i) => i + 1);
          } else {
            setPlaying(false);
            setShowControls(true);
          }
        }}
        className={`w-full h-full max-w-full max-h-full ${getVideoFitClass(
          fitMode,
        )} transition-opacity duration-300 ${hasVideoFrame ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Double-tap Seek Radial Ripple & HUD */}
      {seekBadge && (
        <>
          <div
            key={`full-ripple-${seekBadge.seq}`}
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-0 w-1/2 z-20 ${
              seekBadge.side === 'left'
                ? 'left-0 sx-seek-ripple-left bg-gradient-to-r from-white/20 via-white/10 to-transparent rounded-r-full'
                : 'right-0 sx-seek-ripple-right bg-gradient-to-l from-white/20 via-white/10 to-transparent rounded-l-full'
            }`}
          />
          <div
            key={`full-badge-${seekBadge.seq}`}
            className={`sx-player-badge-pop pointer-events-none absolute top-1/2 z-30 px-4 py-2 rounded-full bg-black/70 backdrop-blur-xl border border-white/20 text-sm font-black tracking-wide shadow-2xl ${
              seekBadge.side === 'left' ? 'left-8 sm:left-16' : 'right-8 sm:right-16'
            }`}
          >
            {seekBadge.label}
          </div>
        </>
      )}

      {/* Horizontal Swipe-to-Seek Live Gesture HUD */}
      {gestureSeekState && (
        <div
          data-testid="player-gesture-seek-hud"
          className="sx-player-center-hud pointer-events-none absolute top-1/2 left-1/2 z-30 min-w-[220px] px-6 py-4 rounded-3xl bg-black/75 backdrop-blur-2xl border border-white/25 shadow-2xl text-center space-y-2"
        >
          <p className="text-xl font-black font-mono-tabular tracking-tight text-white">
            {formatSignedSeekDelta(gestureSeekState.deltaSeconds)}
          </p>
          <p className="text-xs font-bold font-mono-tabular text-white/85">
            {formatPlayerTime(gestureSeekState.targetTime)} /{' '}
            {formatPlayerTime(effectiveDuration)}
          </p>
          <div className="h-1.5 w-full rounded-full bg-white/25 overflow-hidden">
            <div
              style={{ width: `${gestureSeekRatio}%` }}
              className="h-full rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.65)] transition-[width] duration-75"
            />
          </div>
        </div>
      )}

      {/* Vertical Right Swipe Volume HUD */}
      {volumeHudVisible && (
        <div
          data-testid="player-gesture-volume-hud"
          className="sx-player-badge-pop pointer-events-none absolute right-5 sm:right-12 top-1/2 z-30 px-3 py-4 rounded-3xl bg-black/75 backdrop-blur-2xl border border-white/25 shadow-2xl flex flex-col items-center gap-2.5"
        >
          {volumePercent === 0 ? (
            <VolumeX className="w-5 h-5 text-white/85" />
          ) : (
            <Volume2 className="w-5 h-5 text-white" />
          )}
          <div className="w-2 h-28 rounded-full bg-white/25 overflow-hidden flex items-end">
            <div
              style={{ height: `${volumePercent}%` }}
              className="w-full rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.65)] transition-[height] duration-75"
            />
          </div>
          <span className="text-[11px] font-extrabold font-mono-tabular text-white">
            {volumePercent}%
          </span>
        </div>
      )}

      {/* Vertical Left Swipe Brightness HUD */}
      {brightnessHudVisible && (
        <div
          data-testid="player-gesture-brightness-hud"
          className="sx-player-badge-pop pointer-events-none absolute left-5 sm:left-12 top-1/2 z-30 px-3 py-4 rounded-3xl bg-black/70 backdrop-blur-2xl border border-white/20 shadow-2xl flex flex-col items-center gap-2.5"
        >
          <Sun className="w-5 h-5 text-[var(--sx-player-accent)]" />
          <div className="w-2 h-28 rounded-full bg-white/20 overflow-hidden flex items-end">
            <div
              style={{ height: `${brightnessPercent}%` }}
              className="w-full rounded-full bg-[var(--sx-player-accent)] transition-[height] duration-75"
            />
          </div>
          <span className="text-[11px] font-extrabold font-mono-tabular text-white">
            {brightnessPercent}%
          </span>
        </div>
      )}

      {/* Custom Subtitle Overlay */}
      {activeCue && (
        <div
          className={`pointer-events-none absolute inset-x-6 flex justify-center z-20 transition-all duration-200 ${
            state.playerPrefs.subtitlePosition === 'top'
              ? 'top-20'
              : controlsVisible
                ? 'bottom-32 sm:bottom-28'
                : 'bottom-10'
          }`}
        >
          <p
            key={activeCue.text}
            style={{
              fontSize: `${state.playerPrefs.subtitleSize}px`,
              color: state.playerPrefs.subtitleColor || '#ffffff',
            }}
            className={`sx-player-subtitle-enter px-4 py-1.5 rounded-2xl text-center font-bold max-w-3xl leading-snug transition-all duration-200 ${
              state.playerPrefs.subtitleBackground
                ? 'bg-black/72 backdrop-blur-md border border-white/10'
                : 'drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]'
            }`}
          >
            {activeCue.text}
          </p>
        </div>
      )}

      {/* Controls Overlay */}
      <div
        className={`sx-player-controls-fade absolute inset-0 z-20 flex flex-col justify-between pointer-events-none p-3 sm:p-5 ${
          controlsVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Top Frosted Floating Header */}
        <div
          className={`pointer-events-auto relative flex items-center justify-between gap-2 sm:gap-3 transition-transform duration-300 ${
            controlsVisible ? 'translate-y-0' : '-translate-y-3'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full bg-black/55 backdrop-blur-2xl border border-white/15 shadow-xl max-w-[56%] sm:max-w-[60%]">
            <button
              type="button"
              data-testid="player-back-btn"
              onClick={handleLeavePlayer}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div
              key={`full-ep-title-${currentEpisode.id}`}
              className={`${epBadgeAnimClass} min-w-0 pr-1.5`}
            >
              <p className="text-xs sm:text-sm font-extrabold truncate">{title}</p>
              <p className="text-[11px] text-white/75 truncate">
                EP {currentEpisode.number}: {currentEpisode.title}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <span className="hidden md:inline-flex items-center px-3 py-2 rounded-full bg-black/55 backdrop-blur-2xl border border-white/15 text-[11px] font-extrabold tracking-wide">
              {activeQualityLabel}
            </span>
            <button
              type="button"
              aria-label="Select stream server"
              onClick={() => {
                setShowServerMenu((v) => !v);
                setShowSettingsMenu(false);
                setShowEpisodeDrawer(false);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-full bg-black/55 backdrop-blur-2xl border border-white/15 hover:bg-white/15 text-xs font-bold shadow-xl transition-colors"
            >
              <Server className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{selectedServer.name}</span>
            </button>
            <button
              type="button"
              data-testid="player-episodes-btn"
              aria-label="Episode list"
              onClick={() => {
                setShowEpisodeDrawer((v) => !v);
                setShowSettingsMenu(false);
                setShowServerMenu(false);
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-full backdrop-blur-2xl border text-xs font-bold shadow-xl transition-colors ${
                showEpisodeDrawer
                  ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] border-[var(--sx-player-accent)]'
                  : 'bg-black/55 border-white/15 hover:bg-white/15 text-white'
              }`}
            >
              <ListVideo className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Episodes</span>
            </button>
            <button
              type="button"
              data-testid="player-settings-btn"
              aria-label="Player settings"
              onClick={() => {
                setShowSettingsMenu((v) => !v);
                setShowServerMenu(false);
                setShowEpisodeDrawer(false);
              }}
              className={`w-9 h-9 rounded-full backdrop-blur-2xl border flex items-center justify-center shadow-xl transition-transform duration-300 ${
                showSettingsMenu
                  ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] border-[var(--sx-player-accent)] rotate-45'
                  : 'bg-black/55 border-white/15 hover:bg-white/15 text-white'
              }`}
              title="Player Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowShortcuts(true)}
              className="hidden sm:flex w-9 h-9 rounded-full bg-black/55 backdrop-blur-2xl border border-white/15 hover:bg-white/15 items-center justify-center shadow-xl transition-colors"
              title="Keyboard Shortcuts"
              aria-label="Keyboard Shortcuts"
            >
              <Keyboard className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center Tactile Controls */}
        <div
          className={`flex items-center justify-center gap-4 sm:gap-8 transition-all duration-300 ${
            gestureSeekState
              ? 'opacity-15 scale-90 pointer-events-none'
              : showSettingsMenu || showServerMenu || showEpisodeDrawer
                ? 'opacity-0 scale-90 pointer-events-none'
                : controlsVisible
                  ? 'opacity-100 scale-100 pointer-events-auto'
                  : 'opacity-0 scale-95 pointer-events-none'
          }`}
        >
          <button
            type="button"
            disabled={epIndex <= 0}
            onClick={() => setEpIndex((i) => Math.max(0, i - 1))}
            className="w-11 h-11 rounded-full bg-black/55 backdrop-blur-xl border border-white/15 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center transition-all shadow-lg"
            title="Previous Episode"
            aria-label="Previous Episode"
          >
            <SkipBack className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => seekBy(-10)}
            className="w-12 h-12 rounded-full bg-black/55 backdrop-blur-xl border border-white/15 hover:bg-white/20 flex items-center justify-center transition-all shadow-lg"
            title="Rewind 10s"
            aria-label="Rewind 10s"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
          <button
            type="button"
            data-testid="player-play-btn"
            onClick={togglePlay}
            className="sx-player-play-btn w-16 h-16 rounded-full bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] shadow-2xl flex items-center justify-center border border-white/20"
            title={playing ? 'Pause' : 'Play'}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <Pause key="full-pause" className="sx-player-icon-pop w-7 h-7 fill-current" />
            ) : (
              <Play key="full-play" className="sx-player-icon-pop w-7 h-7 fill-current ml-0.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => seekBy(10)}
            className="w-12 h-12 rounded-full bg-black/55 backdrop-blur-xl border border-white/15 hover:bg-white/20 flex items-center justify-center transition-all shadow-lg"
            title="Forward 10s"
            aria-label="Forward 10s"
          >
            <RotateCw className="w-5 h-5" />
          </button>
          <button
            type="button"
            disabled={epIndex >= episodes.length - 1}
            onClick={() => setEpIndex((i) => Math.min(episodes.length - 1, i + 1))}
            className="w-11 h-11 rounded-full bg-black/55 backdrop-blur-xl border border-white/15 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center transition-all shadow-lg"
            title="Next Episode"
            aria-label="Next Episode"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>

        {/* Bottom Floating Frosted Control Dock */}
        <div
          className={`pointer-events-auto space-y-2.5 transition-transform duration-300 ${
            controlsVisible ? 'translate-y-0' : 'translate-y-3'
          }`}
        >
          {/* Quick Skip Pills Row */}
          <div className="flex items-center justify-end gap-2">
            {activeSkip && (
              <button
                type="button"
                onClick={() => {
                  if (videoRef.current) videoRef.current.currentTime = activeSkip.endTime;
                }}
                className="sx-player-skip-pill inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] text-xs font-extrabold shadow-xl hover:scale-105 transition-transform"
              >
                <FastForward className="w-3.5 h-3.5" />
                <span>Skip {activeSkip.skipType.toUpperCase()}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => seekBy(85)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-xl border border-white/15 hover:bg-white/15 text-xs font-extrabold shadow-lg transition-colors"
              title="Skip Intro (+85s)"
            >
              <FastForward className="w-3.5 h-3.5" />
              <span>+85s Intro</span>
            </button>
          </div>

          <div
            style={{ borderRadius: `${Math.min(state.themePrefs.uiRoundness, 24)}px` }}
            className="bg-black/60 backdrop-blur-2xl border border-white/15 px-4 py-3 space-y-2.5 shadow-2xl"
          >
            {/* Progress Slider */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono-tabular text-white/85 w-12 text-right">
                {formatPlayerTime(currentTime)}
              </span>
              <div className="group/scrubber relative flex-1 flex items-center h-4">
                <div className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full bg-white/25 overflow-hidden">
                  <div
                    style={{ width: `${progressRatio}%` }}
                    className="h-full bg-[var(--sx-player-accent)] rounded-full transition-[width] duration-100"
                  />
                </div>
                <div
                  aria-hidden="true"
                  style={{ left: `calc(${progressRatio}% - 6px)` }}
                  className="pointer-events-none absolute w-3 h-3 rounded-full bg-white ring-2 ring-[var(--sx-player-accent)] shadow-md transition-transform duration-150 group-hover/scrubber:scale-125"
                />
                <input
                  type="range"
                  aria-label="Playback position"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    if (videoRef.current) videoRef.current.currentTime = t;
                    setCurrentTime(t);
                  }}
                  className="relative z-10 w-full opacity-0 cursor-pointer h-4"
                />
              </div>
              <span className="text-[11px] font-mono-tabular text-white/75 w-12">
                {formatPlayerTime(duration)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = !muted;
                    setMuted(next);
                    if (videoRef.current) videoRef.current.muted = next;
                  }}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                  className="p-1.5 rounded-full hover:bg-white/15 transition-colors"
                >
                  {muted || volume === 0 ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  aria-label="Volume"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setVolume(val);
                    setMuted(val === 0);
                    if (videoRef.current) {
                      videoRef.current.volume = val;
                      videoRef.current.muted = val === 0;
                    }
                  }}
                  className="w-16 sm:w-24 accent-[var(--sx-player-accent)] cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <button
                  type="button"
                  data-testid="player-toggle-autoplay"
                  aria-pressed={autoPlay}
                  onClick={() => updatePlayerPrefs({ autoPlay: !autoPlay })}
                  className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold transition-colors border ${
                    autoPlay
                      ? 'bg-[var(--sx-player-accent)]/20 text-[var(--sx-player-accent)] border-[var(--sx-player-accent)]/45'
                      : 'bg-white/10 border-transparent text-white/70 hover:bg-white/20'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      autoPlay ? 'bg-[var(--sx-player-accent)]' : 'bg-white/45'
                    }`}
                  />
                  <span>Auto Play</span>
                </button>

                <button
                  type="button"
                  data-testid="player-toggle-autonext"
                  aria-pressed={state.playerPrefs.autoNextEpisode}
                  onClick={() =>
                    updatePlayerPrefs({ autoNextEpisode: !state.playerPrefs.autoNextEpisode })
                  }
                  className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold transition-colors border ${
                    state.playerPrefs.autoNextEpisode
                      ? 'bg-[var(--sx-player-accent)]/20 text-[var(--sx-player-accent)] border-[var(--sx-player-accent)]/45'
                      : 'bg-white/10 border-transparent text-white/70 hover:bg-white/20'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      state.playerPrefs.autoNextEpisode
                        ? 'bg-[var(--sx-player-accent)]'
                        : 'bg-white/45'
                    }`}
                  />
                  <span>Auto Next</span>
                </button>

                <button
                  type="button"
                  data-testid="player-toggle-autoskip"
                  aria-pressed={state.playerPrefs.autoSkipOp || state.playerPrefs.autoSkipEd}
                  onClick={() => {
                    const next = !(state.playerPrefs.autoSkipOp || state.playerPrefs.autoSkipEd);
                    updatePlayerPrefs({ autoSkipOp: next, autoSkipEd: next });
                  }}
                  className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold transition-colors border ${
                    state.playerPrefs.autoSkipOp || state.playerPrefs.autoSkipEd
                      ? 'bg-[var(--sx-player-accent)]/20 text-[var(--sx-player-accent)] border-[var(--sx-player-accent)]/45'
                      : 'bg-white/10 border-transparent text-white/70 hover:bg-white/20'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      state.playerPrefs.autoSkipOp || state.playerPrefs.autoSkipEd
                        ? 'bg-[var(--sx-player-accent)]'
                        : 'bg-white/45'
                    }`}
                  />
                  <span>Auto Skip</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const speeds = [0.75, 1, 1.25, 1.5, 2];
                    const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
                    setSpeed(next);
                    updatePlayerPrefs({ defaultSpeed: next });
                    if (videoRef.current) videoRef.current.playbackRate = next;
                  }}
                  className="px-2 sm:px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[11px] sm:text-xs font-mono-tabular font-bold transition-colors"
                >
                  {speed}x
                </button>

                <button
                  type="button"
                  onClick={() => updatePlayerPrefs({ subtitleEnabled: !subtitlesOn })}
                  className={`inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-bold transition-colors ${
                    subtitlesOn
                      ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)]'
                      : 'bg-white/10 hover:bg-white/20'
                  }`}
                >
                  <Subtitles className="w-3.5 h-3.5" />
                  <span>{activeSubLang.toUpperCase()}</span>
                </button>

                <button
                  type="button"
                  data-testid="player-fit-btn"
                  onClick={() => {
                    const modes: VideoFitMode[] = ['contain', 'cover', 'fill'];
                    const next = modes[(modes.indexOf(fitMode) + 1) % modes.length];
                    updatePlayerPrefs({ videoFit: next });
                  }}
                  className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[10px] sm:text-[11px] font-bold transition-colors"
                  title={`Aspect Fit: ${fitMode}`}
                >
                  <RectangleHorizontal className="w-3.5 h-3.5" />
                  <span className="capitalize">
                    {fitMode === 'contain' ? 'Fit' : fitMode === 'cover' ? 'Zoom' : 'Fill'}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="player-pip-btn"
                  onClick={enterPipAndBrowse}
                  title="Picture in Picture (continue watching while browsing)"
                  aria-label="Picture in Picture"
                  className="flex p-1.5 rounded-full hover:bg-white/15 transition-colors"
                >
                  <PictureInPicture2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                  className="p-1.5 rounded-full hover:bg-white/15 transition-colors"
                >
                  {isFullscreen ? (
                    <Minimize className="w-4 h-4" />
                  ) : (
                    <Maximize className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Server Selector Popover */}
      {showServerMenu && (
        <div
          data-no-gesture="true"
          className="sx-player-popover absolute top-16 right-4 sm:right-6 z-40 w-64 rounded-3xl bg-zinc-950/90 backdrop-blur-2xl border border-white/15 p-3.5 space-y-1.5 shadow-2xl"
        >
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="text-xs font-extrabold">Select Server</span>
            <button
              type="button"
              onClick={() => setShowServerMenu(false)}
              className="p-1 rounded-full hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {servers.map((srv) => (
            <button
              key={srv.id}
              type="button"
              onClick={() => {
                setSelectedServer(srv);
                setShowServerMenu(false);
              }}
              className={`w-full text-left px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-colors ${
                selectedServer.id === srv.id
                  ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)]'
                  : 'hover:bg-white/10'
              }`}
            >
              {srv.name}
            </button>
          ))}
        </div>
      )}

      {/* Player Settings Popover (Playback, Quality, Subtitle Editor) */}
      <PlayerSettingsPopover
        open={showSettingsMenu}
        onClose={() => setShowSettingsMenu(false)}
        playerPrefs={state.playerPrefs}
        onUpdatePrefs={updatePlayerPrefs}
        speed={speed}
        onChangeSpeed={(s) => {
          setSpeed(s);
          if (videoRef.current) videoRef.current.playbackRate = s;
        }}
        muted={muted}
        onToggleMute={() => {
          setMuted((m) => {
            if (videoRef.current) videoRef.current.muted = !m;
            return !m;
          });
        }}
        hlsQualityOptions={hlsQualityOptions}
        selectedHlsLevel={selectedHlsLevel}
        onSelectHlsLevel={handleSelectHlsLevel}
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
        onOpenShortcuts={() => setShowShortcuts(true)}
      />

      {/* Smooth Slide-over Episode Drawer */}
      <PlayerEpisodeDrawer
        open={showEpisodeDrawer}
        episodes={episodes}
        activeIndex={epIndex}
        onSelectEpisode={(idx) => setEpIndex(idx)}
        onClose={() => setShowEpisodeDrawer(false)}
      />

      {/* Keyboard & Gesture Shortcuts Modal */}
      {showShortcuts && (
        <div
          data-no-gesture="true"
          className="sx-backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="sx-sheet-enter w-full max-w-sm rounded-3xl bg-zinc-900/95 backdrop-blur-2xl border border-white/15 p-5 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold">Gestures &amp; Shortcuts</h3>
              <button
                type="button"
                onClick={() => setShowShortcuts(false)}
                className="p-1 rounded-full hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 text-xs">
              {[
                ['Swipe Left / Right', 'Seek timeline'],
                ['Swipe Up / Down (Right)', 'Volume control'],
                ['Swipe Up / Down (Left)', 'Screen brightness'],
                ['Space / K', 'Play / Pause'],
                ['Left / Right', 'Seek -10s / +10s'],
                ['Up / Down / Wheel', 'Volume ±5%'],
                ['Double Click Left/Right', 'Quick Seek -10s / +10s'],
                ['M', 'Mute / Unmute'],
                ['F', 'Toggle Fullscreen'],
                ['N', 'Next Episode'],
              ].map(([k, desc]) => (
                <div
                  key={k}
                  className="flex items-center justify-between py-1.5 border-b border-white/10 last:border-0"
                >
                  <span className="font-mono-tabular font-bold text-[var(--sx-tertiary)]">{k}</span>
                  <span className="text-white/80">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
