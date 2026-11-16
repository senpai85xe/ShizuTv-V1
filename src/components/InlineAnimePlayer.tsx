import React, { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  ArrowLeft,
  ArrowRight,
  Cast,
  ExternalLink,
  FastForward,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Settings,
  Sparkles,
  Subtitles,
  Volume2,
  VolumeX,
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
  clampEpisodeIndex,
  computeAutoSkipTarget,
  formatScrubberPercent,
  getEffectiveDurationSeconds,
  getEpisodeNavigationState,
} from '../utils/inlinePlayer';

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
  const ambientCanvasRef = useRef<HTMLCanvasElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const seekFeedbackTimerRef = useRef<number | null>(null);

  const [autoPlay, setAutoPlay] = useState(true);
  const [ambientEnabled, setAmbientEnabled] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [hasVideoFrame, setHasVideoFrame] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(state.playerPrefs.defaultSpeed || 1);
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain');
  const [subtitlesOn, setSubtitlesOn] = useState(true);
  const [activeSubLang, setActiveSubLang] = useState<'en' | 'ja'>('en');
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showServerMenu, setShowServerMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [seekBadge, setSeekBadge] = useState<{ label: string; side: 'left' | 'right' } | null>(
    null,
  );
  const [skipIntervals, setSkipIntervals] = useState<SkipInterval[]>([]);

  const autoNext = state.playerPrefs.autoNextEpisode;
  const autoSkip = state.playerPrefs.autoSkipOp || state.playerPrefs.autoSkipEd;

  const scheduleHideControls = (currentlyPlaying = playing) => {
    setShowControls(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (currentlyPlaying && !showServerMenu && !showSettingsMenu) {
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

  // Load HLS or MP4 video stream
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setHasVideoFrame(false);
    setCurrentTime(0);
    setDuration(0);

    let hls: Hls | null = null;
    const shouldStart = autoPlay || playSignal > 0;

    if (stream.isHls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(stream.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.playbackRate = speed;
        if (shouldStart) {
          video.play().catch(() => {});
        }
      });
    } else {
      video.src = stream.url;
      video.playbackRate = speed;
      if (shouldStart) {
        video.play().catch(() => {});
      }
    }

    return () => {
      if (hls) hls.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.url, stream.isHls, currentEpisode.id]);

  // Respond to explicit play triggers (e.g., episode click or floating Start Watching CTA)
  useEffect(() => {
    if (playSignal <= 0) return;
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

  // Subtle ambient background glow sampled from active playing frames (graceful fallback on CORS)
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

  const activeTrack = stream.subtitles?.find((s) => s.lang === activeSubLang);
  const activeCue =
    subtitlesOn && activeTrack?.cues
      ? activeTrack.cues.find((c) => currentTime >= c.start && currentTime <= c.end)
      : null;

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

  const effectiveDuration = getEffectiveDurationSeconds(
    duration,
    currentEpisode.durationSeconds,
    media.duration,
  );
  const progressPercent = formatScrubberPercent(currentTime, effectiveDuration);
  const backdropArtwork = currentEpisode.thumbnail || media.banner || media.cover || '';
  const animeTitle = getPreferredTitle(media.title, state.contentPrefs.titlePreference);

  return (
    <section
      data-testid="inline-anime-player"
      aria-label={`Inline player for ${animeTitle}`}
      className="relative mb-5"
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
        {/* Base Artwork / Dynamic Color Glow */}
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

        {/* Real-time Video Frame Sampler (paints dynamic frame colors over artwork when CORS permits) */}
        <canvas
          ref={ambientCanvasRef}
          width={32}
          height={18}
          className={`absolute inset-0 w-full h-full rounded-[42px] blur-3xl saturate-150 transition-opacity duration-500 ${
            playing && hasVideoFrame ? 'opacity-85' : 'opacity-0'
          }`}
        />

        {/* Subtle Secondary Radial Halos around corners for smooth "thoda thoda" bleed */}
        <div
          className={`absolute -inset-2 rounded-[40px] blur-2xl transition-opacity duration-700 ${
            playing ? 'opacity-65' : 'opacity-20'
          }`}
          style={{
            background:
              'radial-gradient(circle at 20% 35%, color-mix(in srgb, var(--sx-primary) 42%, transparent), transparent 58%), radial-gradient(circle at 82% 70%, rgba(251, 191, 36, 0.28), transparent 55%)',
          }}
        />
      </div>

      {/* Rounded 16:9 Inline Video Stage */}
      <div
        ref={playerContainerRef}
        onMouseMove={() => scheduleHideControls()}
        onTouchStart={() => scheduleHideControls()}
        style={{ borderRadius: isFullscreen ? '0px' : `${state.themePrefs.uiRoundness}px` }}
        className={`relative aspect-video w-full overflow-hidden bg-zinc-950 text-white border border-white/25 dark:border-white/15 select-none transition-shadow duration-700 ${
          playing && ambientEnabled
            ? 'shadow-[0_18px_52px_-12px_rgba(0,0,0,0.65),0_0_46px_-8px_color-mix(in_srgb,var(--sx-primary)_45%,transparent)]'
            : 'shadow-[0_14px_38px_rgba(15,23,42,0.28)]'
        }`}
      >
        {/* Artwork Preview underneath until video frame renders */}
        {backdropArtwork && (
          <img
            src={backdropArtwork}
            alt={currentEpisode.title}
            className={`pointer-events-none absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
              hasVideoFrame && playing ? 'opacity-0' : 'opacity-75'
            }`}
          />
        )}

        <video
          ref={videoRef}
          playsInline
          onClick={() => {
            if (showServerMenu || showSettingsMenu) {
              setShowServerMenu(false);
              setShowSettingsMenu(false);
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
          className={`relative z-10 w-full h-full ${
            fitMode === 'cover' ? 'object-cover' : 'object-contain'
          }`}
        />

        {/* Subtle Dark Legibility Vignette when controls are shown */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/70 via-black/20 to-black/45 transition-opacity duration-300 ${
            showControls || !playing ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Double-tap Seek HUD */}
        {seekBadge && (
          <div
            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 z-30 px-3.5 py-1.5 rounded-full bg-black/65 backdrop-blur-xl border border-white/20 text-xs font-black tracking-wide shadow-xl ${
              seekBadge.side === 'left' ? 'left-5 sm:left-10' : 'right-5 sm:right-10'
            }`}
          >
            {seekBadge.label}
          </div>
        )}

        {/* Active Subtitle Cue */}
        {activeCue && (
          <div className="pointer-events-none absolute bottom-16 inset-x-4 flex justify-center z-20">
            <p className="px-3 py-1 rounded-xl bg-black/70 backdrop-blur-md border border-white/10 text-[11px] sm:text-xs font-bold text-center max-w-md leading-snug">
              {activeCue.text}
            </p>
          </div>
        )}

        {/* Controls Overlay */}
        <div
          className={`absolute inset-0 z-20 flex flex-col justify-between p-2.5 sm:p-3.5 transition-opacity duration-300 pointer-events-none ${
            showControls || !playing || showServerMenu || showSettingsMenu
              ? 'opacity-100'
              : 'opacity-0'
          }`}
        >
          {/* Top Overlay Row: Cast/Server Left · Episode Tag · Settings Right */}
          <div className="pointer-events-auto relative flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="Stream server and cast"
              data-testid="inline-player-cast-btn"
              onClick={() => {
                setShowServerMenu((v) => !v);
                setShowSettingsMenu(false);
              }}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-black/35 hover:bg-black/55 backdrop-blur-md border border-white/15 flex items-center justify-center transition-colors"
            >
              <Cast className="w-4 h-4 text-white" />
            </button>

            <span className="px-2.5 py-1 rounded-full bg-black/35 backdrop-blur-md border border-white/10 text-[10px] sm:text-[11px] font-bold tracking-wide text-white/90 truncate max-w-[56%]">
              EP {currentEpisode.number} · {currentEpisode.title}
            </span>

            <button
              type="button"
              aria-label="Player settings"
              data-testid="inline-player-settings-btn"
              onClick={() => {
                setShowSettingsMenu((v) => !v);
                setShowServerMenu(false);
              }}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-black/35 hover:bg-black/55 backdrop-blur-md border border-white/15 flex items-center justify-center transition-colors"
            >
              <Settings className="w-4 h-4 text-white" />
            </button>

            {/* Server Popover */}
            {showServerMenu && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute top-10 left-0 z-30 w-56 rounded-2xl bg-zinc-950/90 backdrop-blur-2xl border border-white/15 p-2 space-y-1 shadow-2xl"
              >
                <p className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white/60">
                  Stream Mirror ({stream.quality})
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
                          ? 'bg-amber-400 text-black'
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

            {/* Settings Popover */}
            {showSettingsMenu && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute top-10 right-0 z-30 w-56 sm:w-60 max-w-[calc(100vw-3rem)] rounded-2xl bg-zinc-950/92 backdrop-blur-2xl border border-white/15 p-3 space-y-2.5 shadow-2xl text-xs"
              >
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-white/60 mb-1.5">
                    Playback Speed
                  </p>
                  <div className="grid grid-cols-5 gap-1">
                    {[0.75, 1, 1.25, 1.5, 2].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          setSpeed(r);
                          updatePlayerPrefs({ defaultSpeed: r });
                        }}
                        className={`py-1 rounded-lg text-[10px] font-extrabold tabular-nums transition-colors ${
                          speed === r
                            ? 'bg-amber-400 text-black'
                            : 'bg-white/10 text-white hover:bg-white/20'
                        }`}
                      >
                        {r}×
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMuted((m) => !m)}
                    className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-bold"
                  >
                    {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    <span>{muted ? 'Muted' : 'Audio On'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFitMode((f) => (f === 'contain' ? 'cover' : 'contain'))}
                    className="py-1.5 px-2 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-bold capitalize"
                  >
                    Fit: {fitMode}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (!subtitlesOn) {
                        setSubtitlesOn(true);
                        setActiveSubLang('en');
                      } else if (activeSubLang === 'en') {
                        setActiveSubLang('ja');
                      } else {
                        setSubtitlesOn(false);
                      }
                    }}
                    className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-bold"
                  >
                    <Subtitles className="w-3.5 h-3.5" />
                    <span>{subtitlesOn ? `Sub: ${activeSubLang.toUpperCase()}` : 'Subs Off'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmbientEnabled((v) => !v)}
                    className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl text-[11px] font-bold ${
                      ambientEnabled
                        ? 'bg-amber-400/20 text-amber-300 border border-amber-400/35'
                        : 'bg-white/10 text-white/75'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Ambient {ambientEnabled ? 'On' : 'Off'}</span>
                  </button>
                </div>

                {onOpenFullPlayer && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowSettingsMenu(false);
                      onOpenFullPlayer(safeIndex);
                    }}
                    className="w-full py-1.5 px-3 rounded-xl bg-white/12 hover:bg-white/20 text-[11px] font-extrabold flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Dedicated Player</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Center Playback Cluster (-10s · Play/Pause · +10s) */}
          <div className="pointer-events-auto flex items-center justify-center gap-6 sm:gap-10">
            <button
              type="button"
              aria-label="Rewind 10 seconds"
              onClick={() => seekBy(-10)}
              className="relative w-10 h-10 rounded-full hover:bg-white/15 flex items-center justify-center transition-all active:scale-90"
            >
              <RotateCcw className="w-6 h-6 text-white drop-shadow" />
              <span className="absolute text-[9px] font-black mt-0.5 text-white tabular-nums">
                10
              </span>
            </button>

            <button
              type="button"
              aria-label={playing ? 'Pause playback' : 'Play playback'}
              data-testid="inline-player-play-btn"
              onClick={togglePlay}
              className="w-14 h-14 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/25 flex items-center justify-center shadow-2xl transition-all active:scale-95"
            >
              {playing ? (
                <Pause className="w-7 h-7 fill-white text-white" />
              ) : (
                <Play className="w-7 h-7 fill-white text-white ml-0.5" />
              )}
            </button>

            <button
              type="button"
              aria-label="Forward 10 seconds"
              onClick={() => seekBy(10)}
              className="relative w-10 h-10 rounded-full hover:bg-white/15 flex items-center justify-center transition-all active:scale-90"
            >
              <RotateCw className="w-6 h-6 text-white drop-shadow" />
              <span className="absolute text-[9px] font-black mt-0.5 text-white tabular-nums">
                10
              </span>
            </button>
          </div>

          {/* Bottom Frosted Floating Scrubber Pill */}
          <div className="pointer-events-auto space-y-2">
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
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-black text-[11px] font-extrabold shadow-lg hover:bg-amber-300 transition-colors"
                >
                  <FastForward className="w-3.5 h-3.5" />
                  <span>Skip {activeSkip.skipType === 'ed' ? 'Ending' : 'Opening'}</span>
                </button>
              </div>
            )}

            <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-black/45 backdrop-blur-xl border border-white/15 shadow-lg">
              <span className="text-[11px] font-bold text-white/95 tabular-nums shrink-0">
                {formatPlayerTime(currentTime)}
              </span>

              <div className="relative flex-1 flex items-center h-4">
                <div className="w-full h-1 rounded-full bg-white/25 overflow-hidden">
                  <div
                    style={{ width: `${progressPercent}%` }}
                    className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-200 transition-[width] duration-150"
                  />
                </div>
                <span
                  aria-hidden="true"
                  style={{ left: `calc(${progressPercent}% - 5px)` }}
                  className="pointer-events-none absolute w-2.5 h-2.5 rounded-full bg-amber-100 shadow-[0_0_8px_rgba(253,230,138,0.9)]"
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
      </div>

      {/* Episode Navigation & Auto Controls Bar Below Player */}
      <div
        data-testid="inline-player-controls-bar"
        className="mt-3 flex items-center justify-between gap-1 sm:gap-2"
      >
        <button
          type="button"
          data-testid="inline-player-prev-btn"
          disabled={!navState.hasPrev}
          onClick={() => onChangeEpisodeIndex(navState.prevIndex)}
          className="inline-flex items-center gap-0.5 sm:gap-1 px-1 sm:px-2 py-1.5 rounded-full text-[11px] sm:text-xs font-extrabold text-[var(--sx-on-surface)] hover:text-[var(--sx-primary)] disabled:opacity-35 disabled:pointer-events-none transition-colors shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Prev</span>
        </button>

        <div className="flex-1 min-w-0 flex items-center justify-center gap-1 sm:gap-2">
          <button
            type="button"
            data-testid="toggle-auto-play"
            aria-pressed={autoPlay}
            onClick={() => setAutoPlay((v) => !v)}
            className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full backdrop-blur-lg border text-[10px] sm:text-[11px] font-bold whitespace-nowrap transition-all ${
              autoPlay
                ? 'bg-[var(--sx-surface-container)]/42 dark:bg-white/12 border-white/50 dark:border-white/20 text-[var(--sx-on-surface)] shadow-sm'
                : 'bg-[var(--sx-surface-container)]/22 dark:bg-white/5 border-white/30 dark:border-white/10 text-[var(--sx-on-surface-muted)]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                autoPlay
                  ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.85)]'
                  : 'bg-[var(--sx-on-surface-muted)]/60'
              }`}
            />
            <span>Auto Play</span>
          </button>

          <button
            type="button"
            data-testid="toggle-auto-next"
            aria-pressed={autoNext}
            onClick={() => updatePlayerPrefs({ autoNextEpisode: !autoNext })}
            className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full backdrop-blur-lg border text-[10px] sm:text-[11px] font-bold whitespace-nowrap transition-all ${
              autoNext
                ? 'bg-[var(--sx-surface-container)]/42 dark:bg-white/12 border-white/50 dark:border-white/20 text-[var(--sx-on-surface)] shadow-sm'
                : 'bg-[var(--sx-surface-container)]/22 dark:bg-white/5 border-white/30 dark:border-white/10 text-[var(--sx-on-surface-muted)]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                autoNext
                  ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.85)]'
                  : 'bg-[var(--sx-on-surface-muted)]/60'
              }`}
            />
            <span>Auto Next</span>
          </button>

          <button
            type="button"
            data-testid="toggle-auto-skip"
            aria-pressed={autoSkip}
            onClick={() => updatePlayerPrefs({ autoSkipOp: !autoSkip, autoSkipEd: !autoSkip })}
            className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full backdrop-blur-lg border text-[10px] sm:text-[11px] font-bold whitespace-nowrap transition-all ${
              autoSkip
                ? 'bg-[var(--sx-surface-container)]/42 dark:bg-white/12 border-white/50 dark:border-white/20 text-[var(--sx-on-surface)] shadow-sm'
                : 'bg-[var(--sx-surface-container)]/22 dark:bg-white/5 border-white/30 dark:border-white/10 text-[var(--sx-on-surface-muted)]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                autoSkip
                  ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.85)]'
                  : 'bg-[var(--sx-on-surface-muted)]/60'
              }`}
            />
            <span>Auto Skip</span>
          </button>
        </div>

        <button
          type="button"
          data-testid="inline-player-next-btn"
          disabled={!navState.hasNext}
          onClick={() => onChangeEpisodeIndex(navState.nextIndex)}
          className="inline-flex items-center gap-0.5 sm:gap-1 px-1 sm:px-2 py-1.5 rounded-full text-[11px] sm:text-xs font-extrabold text-[var(--sx-on-surface)] hover:text-[var(--sx-primary)] disabled:opacity-35 disabled:pointer-events-none transition-colors shrink-0"
        >
          <span>Next</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </section>
  );
};
