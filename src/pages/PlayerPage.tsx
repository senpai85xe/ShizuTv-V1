import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Hls from 'hls.js';
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Subtitles,
  Server,
  ListVideo,
  Keyboard,
  FastForward,
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

interface PlayerLocationState {
  media?: UnifiedMedia;
  episodes?: UnifiedEpisode[];
  episodeIndex?: number;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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

  const servers = resolveVideoServers();
  const [selectedServer, setSelectedServer] = useState<VideoServer>(servers[0]);
  const stream = resolveVideoStream(media, currentEpisode, selectedServer);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(state.playerPrefs.defaultSpeed || 1);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [subtitlesOn, setSubtitlesOn] = useState(true);
  const [activeSubLang, setActiveSubLang] = useState('en');

  const [showEpisodeDrawer, setShowEpisodeDrawer] = useState(false);
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
    }, 3000);
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
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
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

  // Keyboard shortcuts matching PlayerKeyboardListener
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
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

  // Auto-skip OP/ED if enabled in PlayerPrefs
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

  return (
    <div
      ref={containerRef}
      onMouseMove={scheduleHideControls}
      className="relative w-full h-screen bg-black text-white overflow-hidden select-none flex items-center justify-center"
    >
      <video
        ref={videoRef}
        playsInline
        onClick={togglePlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
        onEnded={() => {
          if (state.playerPrefs.autoNextEpisode && epIndex < episodes.length - 1) {
            setEpIndex((i) => i + 1);
          }
        }}
        className="w-full h-full object-contain"
      />

      {/* Custom Subtitle Overlay */}
      {activeCue && (
        <div className="pointer-events-none absolute bottom-24 inset-x-6 flex justify-center z-20">
          <p
            style={{ fontSize: `${state.playerPrefs.subtitleSize}px` }}
            className={`px-4 py-1.5 rounded-lg text-center font-bold max-w-3xl leading-snug ${
              state.playerPrefs.subtitleBackground ? 'bg-black/75 backdrop-blur-sm' : 'drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]'
            }`}
          >
            {activeCue.text}
          </p>
        </div>
      )}

      {/* AniSkip Button */}
      {activeSkip && (
        <button
          type="button"
          onClick={() => {
            if (videoRef.current) videoRef.current.currentTime = activeSkip.endTime;
          }}
          className="absolute bottom-24 right-6 z-30 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-xs font-extrabold shadow-xl hover:scale-105 transition-transform"
        >
          <FastForward className="w-4 h-4" />
          <span>Skip {activeSkip.skipType.toUpperCase()}</span>
        </button>
      )}

      {/* Controls Overlay */}
      <div
        className={`absolute inset-0 z-20 flex flex-col justify-between transition-opacity duration-200 pointer-events-none ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Top Controls */}
        <div className="pointer-events-auto flex items-center justify-between px-4 sm:px-6 py-4 bg-gradient-to-b from-black/85 via-black/40 to-transparent">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="text-sm sm:text-base font-extrabold truncate">{title}</p>
              <p className="text-xs text-white/75 truncate">
                Episode {currentEpisode.number}: {currentEpisode.title} · {selectedServer.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowServerMenu((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold"
            >
              <Server className="w-4 h-4" />
              <span className="hidden sm:inline">{selectedServer.name}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowEpisodeDrawer(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold"
            >
              <ListVideo className="w-4 h-4" />
              <span className="hidden sm:inline">Episodes</span>
            </button>
            <button
              type="button"
              onClick={() => setShowShortcuts(true)}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20"
              title="Keyboard Shortcuts"
            >
              <Keyboard className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center Controls */}
        <div className="pointer-events-auto flex items-center justify-center gap-6 sm:gap-10">
          <button
            type="button"
            disabled={epIndex <= 0}
            onClick={() => setEpIndex((i) => Math.max(0, i - 1))}
            className="p-3 rounded-full bg-black/50 hover:bg-black/75 disabled:opacity-30 transition-colors"
            title="Previous Episode"
          >
            <SkipBack className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={() => seekBy(-10)}
            className="p-3 rounded-full bg-black/50 hover:bg-black/75 transition-colors"
            title="Rewind 10s"
          >
            <RotateCcw className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            className="p-5 rounded-full bg-[var(--sx-primary)] text-[var(--sx-on-primary)] shadow-2xl hover:scale-105 transition-transform"
            title={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current" />}
          </button>
          <button
            type="button"
            onClick={() => seekBy(10)}
            className="p-3 rounded-full bg-black/50 hover:bg-black/75 transition-colors"
            title="Forward 10s"
          >
            <RotateCw className="w-6 h-6" />
          </button>
          <button
            type="button"
            disabled={epIndex >= episodes.length - 1}
            onClick={() => setEpIndex((i) => Math.min(episodes.length - 1, i + 1))}
            className="p-3 rounded-full bg-black/50 hover:bg-black/75 disabled:opacity-30 transition-colors"
            title="Next Episode"
          >
            <SkipForward className="w-6 h-6" />
          </button>
        </div>

        {/* Bottom Controls */}
        <div className="pointer-events-auto px-4 sm:px-6 pb-5 pt-8 bg-gradient-to-t from-black/90 via-black/50 to-transparent space-y-3">
          {/* Progress Slider */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono-tabular text-white/80 w-12 text-right">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={(e) => {
                const t = Number(e.target.value);
                if (videoRef.current) videoRef.current.currentTime = t;
                setCurrentTime(t);
              }}
              className="flex-1 accent-[var(--sx-primary)] cursor-pointer h-1.5"
            />
            <span className="text-xs font-mono-tabular text-white/80 w-12">
              {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const next = !muted;
                  setMuted(next);
                  if (videoRef.current) videoRef.current.muted = next;
                }}
                className="p-1.5 rounded-lg hover:bg-white/10"
              >
                {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
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
                className="w-20 sm:w-24 accent-[var(--sx-primary)] cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const speeds = [0.75, 1, 1.25, 1.5, 2];
                  const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
                  setSpeed(next);
                  if (videoRef.current) videoRef.current.playbackRate = next;
                }}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-mono-tabular font-bold"
              >
                {speed}x
              </button>

              <button
                type="button"
                onClick={() => setSubtitlesOn((s) => !s)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                  subtitlesOn ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]' : 'bg-white/10'
                }`}
              >
                <Subtitles className="w-4 h-4" />
                <span>{activeSubLang.toUpperCase()}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setActiveSubLang((l) => (l === 'en' ? 'ja' : 'en'))
                }
                className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold"
              >
                Track
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                className="p-1.5 rounded-lg hover:bg-white/10"
              >
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Server Selector Popover */}
      {showServerMenu && (
        <div className="absolute top-16 right-6 z-40 w-60 rounded-2xl bg-zinc-900/95 border border-white/15 p-3 space-y-1.5 shadow-2xl">
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="text-xs font-extrabold">Select Server</span>
            <button type="button" onClick={() => setShowServerMenu(false)}>
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
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
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
        <div className="absolute inset-y-0 right-0 z-40 w-80 bg-zinc-950/95 border-l border-white/15 flex flex-col shadow-2xl">
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <h3 className="text-sm font-extrabold">Episodes ({episodes.length})</h3>
            <button type="button" onClick={() => setShowEpisodeDrawer(false)}>
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {episodes.map((ep, idx) => (
              <button
                key={ep.id}
                type="button"
                onClick={() => {
                  setEpIndex(idx);
                  setShowEpisodeDrawer(false);
                }}
                className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-colors ${
                  idx === epIndex
                    ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                    : 'hover:bg-white/10'
                }`}
              >
                <span className="text-xs font-mono-tabular font-black w-7">{ep.number}</span>
                <span className="text-xs font-semibold truncate">{ep.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-white/15 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold">Keyboard Shortcuts</h3>
              <button type="button" onClick={() => setShowShortcuts(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 text-xs">
              {[
                ['Space / K', 'Play / Pause'],
                ['Left / Right', 'Seek -10s / +10s'],
                ['M', 'Mute / Unmute'],
                ['F', 'Toggle Fullscreen'],
                ['N', 'Next Episode'],
              ].map(([k, desc]) => (
                <div key={k} className="flex items-center justify-between py-1 border-b border-white/10">
                  <span className="font-mono-tabular font-bold text-[var(--sx-primary)]">{k}</span>
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
