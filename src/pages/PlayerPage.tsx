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
  Search,
  Server,
  SkipBack,
  SkipForward,
  Subtitles,
  Sun,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
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
  computeSwipeSeekTarget,
  computeSwipeVerticalLevel,
  detectPlayerGestureKind,
  formatSignedSeekDelta,
  PlayerGestureKind,
} from '../utils/playerGestures';

interface PlayerLocationState {
  media?: UnifiedMedia;
  episodes?: UnifiedEpisode[];
  episodeIndex?: number;
  sourceId?: string;
}

export const PlayerPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, recordHistory, upsertLibraryEntry, getLibraryEntry } = useApp();

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
  const [selectedServer, setSelectedServer] = useState<VideoServer>(servers[0]);
  const stream = useMemo(
    () => resolveVideoStream(media, currentEpisode, selectedServer),
    [media, currentEpisode, selectedServer],
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const seekFeedbackTimerRef = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [speed, setSpeed] = useState(state.playerPrefs.defaultSpeed || 1);
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain');
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [subtitlesOn, setSubtitlesOn] = useState(true);
  const [activeSubLang, setActiveSubLang] = useState('en');

  const [seekBadge, setSeekBadge] = useState<{ label: string; side: 'left' | 'right' } | null>(
    null,
  );
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
  const [drawerQuery, setDrawerQuery] = useState('');
  const [showServerMenu, setShowServerMenu] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [skipIntervals, setSkipIntervals] = useState<SkipInterval[]>([]);

  // Attach HLS or native MP4 stream
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;
    if (stream.isHls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(stream.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.playbackRate = speed;
        video.play().catch(() => {});
      });
    } else {
      video.src = stream.url;
      video.playbackRate = speed;
      video.play().catch(() => {});
    }

    return () => {
      if (hls) hls.destroy();
    };
  }, [stream.url, stream.isHls]);

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

  const scheduleHideControls = () => {
    setShowControls(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      if (playing) setShowControls(false);
    }, 3200);
  };

  const triggerSeekFeedback = (delta: number) => {
    const label = delta > 0 ? `+${delta}s` : `${delta}s`;
    const side: 'left' | 'right' = delta < 0 ? 'left' : 'right';
    setSeekBadge({ label, side });
    if (seekFeedbackTimerRef.current) window.clearTimeout(seekFeedbackTimerRef.current);
    seekFeedbackTimerRef.current = window.setTimeout(() => setSeekBadge(null), 650);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
    scheduleHideControls();
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

  const togglePiP = async () => {
    const v = videoRef.current;
    if (!v || !('pictureInPictureEnabled' in document)) return;
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
    if (showEpisodeDrawer || showServerMenu || showShortcuts) return;
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
    if (showEpisodeDrawer || showServerMenu || showShortcuts) return;
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

  // Active subtitle cue
  const activeTrack = stream.subtitles?.find((s) => s.lang === activeSubLang);
  const activeCue =
    subtitlesOn && activeTrack?.cues
      ? activeTrack.cues.find((c) => currentTime >= c.start && currentTime <= c.end)
      : null;

  const title = getPreferredTitle(media.title, state.contentPrefs.titlePreference);
  const filteredDrawerEpisodes = useMemo(() => {
    if (!drawerQuery.trim()) return episodes;
    const q = drawerQuery.toLowerCase();
    return episodes.filter(
      (ep) => ep.title.toLowerCase().includes(q) || String(ep.number).includes(q),
    );
  }, [episodes, drawerQuery]);

  const effectiveDuration = duration || 1440;
  const progressRatio =
    effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;
  const gestureSeekRatio =
    gestureSeekState && effectiveDuration > 0
      ? Math.min(100, (gestureSeekState.targetTime / effectiveDuration) * 100)
      : progressRatio;
  const volumePercent = Math.round((muted ? 0 : volume) * 100);
  const brightnessPercent = Math.round(brightness * 100);

  return (
    <div
      ref={containerRef}
      data-testid="player-stage"
      onPointerDown={handleStagePointerDown}
      onPointerMove={handleStagePointerMove}
      onPointerUp={handleStagePointerEnd}
      onPointerCancel={handleStagePointerEnd}
      onWheel={handleStageWheel}
      onMouseMove={scheduleHideControls}
      onTouchStart={scheduleHideControls}
      className="relative w-full h-screen bg-black text-white overflow-hidden select-none flex items-center justify-center touch-none"
    >
      <video
        ref={videoRef}
        playsInline
        style={brightness < 1 ? { filter: `brightness(${brightness})` } : undefined}
        onClick={() => {
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
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
        onEnded={() => {
          if (state.playerPrefs.autoNextEpisode && epIndex < episodes.length - 1) {
            setEpIndex((i) => i + 1);
          }
        }}
        className={`w-full h-full ${fitMode === 'cover' ? 'object-cover' : 'object-contain'}`}
      />

      {/* Double-tap Seek HUD */}
      {seekBadge && (
        <div
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 z-30 px-4 py-2 rounded-full bg-black/65 backdrop-blur-xl border border-white/20 text-sm font-black tracking-wide shadow-2xl ${
            seekBadge.side === 'left' ? 'left-8 sm:left-16' : 'right-8 sm:right-16'
          }`}
        >
          {seekBadge.label}
        </div>
      )}

      {/* Horizontal Swipe-to-Seek Live Gesture HUD */}
      {gestureSeekState && (
        <div
          data-testid="player-gesture-seek-hud"
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 min-w-[220px] px-6 py-4 rounded-3xl bg-black/75 backdrop-blur-2xl border border-white/25 shadow-2xl text-center space-y-2"
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
          className="pointer-events-none absolute right-5 sm:right-12 top-1/2 -translate-y-1/2 z-30 px-3 py-4 rounded-3xl bg-black/75 backdrop-blur-2xl border border-white/25 shadow-2xl flex flex-col items-center gap-2.5"
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
          className="pointer-events-none absolute left-5 sm:left-12 top-1/2 -translate-y-1/2 z-30 px-3 py-4 rounded-3xl bg-black/70 backdrop-blur-2xl border border-white/20 shadow-2xl flex flex-col items-center gap-2.5"
        >
          <Sun className="w-5 h-5 text-amber-300" />
          <div className="w-2 h-28 rounded-full bg-white/20 overflow-hidden flex items-end">
            <div
              style={{ height: `${brightnessPercent}%` }}
              className="w-full rounded-full bg-amber-300 transition-[height] duration-75"
            />
          </div>
          <span className="text-[11px] font-extrabold font-mono-tabular text-white">
            {brightnessPercent}%
          </span>
        </div>
      )}

      {/* Custom Subtitle Overlay */}
      {activeCue && (
        <div className="pointer-events-none absolute bottom-28 inset-x-6 flex justify-center z-20">
          <p
            style={{ fontSize: `${state.playerPrefs.subtitleSize}px` }}
            className={`px-4 py-1.5 rounded-2xl text-center font-bold max-w-3xl leading-snug ${
              state.playerPrefs.subtitleBackground
                ? 'bg-black/70 backdrop-blur-md border border-white/10'
                : 'drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]'
            }`}
          >
            {activeCue.text}
          </p>
        </div>
      )}

      {/* Controls Overlay */}
      <div
        className={`absolute inset-0 z-20 flex flex-col justify-between transition-opacity duration-200 pointer-events-none p-3 sm:p-5 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Top Frosted Floating Header */}
        <div className="pointer-events-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 px-3 py-2 rounded-full bg-black/55 backdrop-blur-2xl border border-white/15 shadow-xl max-w-[65%]">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0 pr-2">
              <p className="text-xs sm:text-sm font-extrabold truncate">{title}</p>
              <p className="text-[11px] text-white/75 truncate">
                EP {currentEpisode.number}: {currentEpisode.title}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="hidden md:inline-flex items-center px-3 py-2 rounded-full bg-black/55 backdrop-blur-2xl border border-white/15 text-[11px] font-extrabold tracking-wide">
              {stream.quality}
            </span>
            <button
              type="button"
              onClick={() => setShowServerMenu((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-black/55 backdrop-blur-2xl border border-white/15 hover:bg-white/15 text-xs font-bold shadow-xl transition-colors"
            >
              <Server className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{selectedServer.name}</span>
            </button>
            <button
              type="button"
              data-testid="player-episodes-btn"
              onClick={() => setShowEpisodeDrawer(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-black/55 backdrop-blur-2xl border border-white/15 hover:bg-white/15 text-xs font-bold shadow-xl transition-colors"
            >
              <ListVideo className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Episodes</span>
            </button>
            <button
              type="button"
              onClick={() => setShowShortcuts(true)}
              className="w-9 h-9 rounded-full bg-black/55 backdrop-blur-2xl border border-white/15 hover:bg-white/15 flex items-center justify-center shadow-xl transition-colors"
              title="Keyboard Shortcuts"
              aria-label="Keyboard Shortcuts"
            >
              <Keyboard className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center Tactile Controls */}
        <div
          className={`pointer-events-auto flex items-center justify-center gap-4 sm:gap-8 transition-opacity duration-150 ${
            gestureSeekState ? 'opacity-15 pointer-events-none' : 'opacity-100'
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
            onClick={togglePlay}
            className="w-16 h-16 rounded-full bg-[var(--sx-primary)] text-[var(--sx-on-primary)] shadow-2xl hover:scale-105 flex items-center justify-center transition-transform border border-white/20"
            title={playing ? 'Pause' : 'Play'}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <Pause className="w-7 h-7 fill-current" />
            ) : (
              <Play className="w-7 h-7 fill-current ml-0.5" />
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
        <div className="pointer-events-auto space-y-2.5">
          {/* Quick Skip Pills Row */}
          <div className="flex items-center justify-end gap-2">
            {activeSkip && (
              <button
                type="button"
                onClick={() => {
                  if (videoRef.current) videoRef.current.currentTime = activeSkip.endTime;
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-xs font-extrabold shadow-xl hover:scale-105 transition-transform"
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
              <div className="relative flex-1 flex items-center h-4">
                <div className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full bg-white/25 overflow-hidden">
                  <div
                    style={{ width: `${progressRatio}%` }}
                    className="h-full bg-[var(--sx-primary)] rounded-full"
                  />
                </div>
                <div
                  aria-hidden="true"
                  style={{ left: `calc(${progressRatio}% - 6px)` }}
                  className="pointer-events-none absolute w-3 h-3 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"
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
                  className="w-16 sm:w-24 accent-[var(--sx-primary)] cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const speeds = [0.75, 1, 1.25, 1.5, 2];
                    const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
                    setSpeed(next);
                    if (videoRef.current) videoRef.current.playbackRate = next;
                  }}
                  className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-xs font-mono-tabular font-bold transition-colors"
                >
                  {speed}x
                </button>

                <button
                  type="button"
                  onClick={() => setSubtitlesOn((s) => !s)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-colors ${
                    subtitlesOn
                      ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                      : 'bg-white/10 hover:bg-white/20'
                  }`}
                >
                  <Subtitles className="w-3.5 h-3.5" />
                  <span>{activeSubLang.toUpperCase()}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSubLang((l) => (l === 'en' ? 'ja' : 'en'))}
                  className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[11px] font-bold transition-colors"
                >
                  Track
                </button>

                <button
                  type="button"
                  onClick={() => setFitMode((m) => (m === 'contain' ? 'cover' : 'contain'))}
                  className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[11px] font-bold transition-colors"
                  title={`Aspect Fit: ${fitMode}`}
                >
                  <RectangleHorizontal className="w-3.5 h-3.5" />
                  <span className="capitalize">{fitMode}</span>
                </button>

                <button
                  type="button"
                  onClick={togglePiP}
                  aria-label="Picture in Picture"
                  className="hidden sm:flex p-1.5 rounded-full hover:bg-white/15 transition-colors"
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
          className="absolute top-16 right-4 sm:right-6 z-40 w-64 rounded-3xl bg-zinc-950/85 backdrop-blur-2xl border border-white/15 p-3.5 space-y-1.5 shadow-2xl"
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
                  ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                  : 'hover:bg-white/10'
              }`}
            >
              {srv.name}
            </button>
          ))}
        </div>
      )}

      {/* Episode Drawer */}
      {showEpisodeDrawer && (
        <div
          data-no-gesture="true"
          className="absolute inset-y-0 right-0 z-40 w-80 max-w-[90vw] bg-zinc-950/90 backdrop-blur-2xl border-l border-white/15 flex flex-col shadow-2xl"
        >
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <h3 className="text-sm font-extrabold">Episodes ({episodes.length})</h3>
            <button
              type="button"
              onClick={() => setShowEpisodeDrawer(false)}
              className="p-1.5 rounded-full hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-3 border-b border-white/10">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-white/50 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={drawerQuery}
                onChange={(e) => setDrawerQuery(e.target.value)}
                placeholder="Jump to episode..."
                className="w-full pl-8 pr-3 py-2 rounded-full bg-white/10 border border-white/10 text-xs focus:outline-none focus:border-white/30"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {filteredDrawerEpisodes.map((ep) => {
              const realIdx = episodes.findIndex((item) => item.id === ep.id);
              const isActive = realIdx === epIndex;
              return (
                <button
                  key={ep.id}
                  type="button"
                  onClick={() => {
                    setEpIndex(realIdx >= 0 ? realIdx : 0);
                    setShowEpisodeDrawer(false);
                  }}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-2xl text-left transition-colors ${
                    isActive
                      ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                      : 'hover:bg-white/10'
                  }`}
                >
                  <span className="text-xs font-mono-tabular font-black w-7 shrink-0">
                    {ep.number}
                  </span>
                  <span className="text-xs font-semibold truncate">{ep.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Keyboard & Gesture Shortcuts Modal */}
      {showShortcuts && (
        <div
          data-no-gesture="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-zinc-900/95 backdrop-blur-2xl border border-white/15 p-5 space-y-3 shadow-2xl"
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
