import React, { useMemo, useState } from 'react';
import {
  Check,
  ExternalLink,
  Keyboard,
  PictureInPicture2,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Subtitles,
  Tv,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  PlayerPrefs,
  SubtitlePosition,
  VideoFitMode,
  VideoQualityPref,
} from '../store/AppContext';
import { VideoServer } from '../types/media';
import {
  HlsQualityOption,
  parseSubtitleText,
  SubtitleCue,
} from '../utils/inlinePlayer';
import { formatPlayerTime } from '../utils/detailsLayout';

export type PlayerSettingsTab = 'playback' | 'quality' | 'subtitles';

interface SubtitleTrackSummary {
  lang: string;
  label: string;
}

interface PlayerSettingsPopoverProps {
  open: boolean;
  onClose: () => void;
  playerPrefs: PlayerPrefs;
  onUpdatePrefs: (patch: Partial<PlayerPrefs>) => void;
  speed: number;
  onChangeSpeed: (speed: number) => void;
  muted: boolean;
  onToggleMute: () => void;
  // Quality & servers
  hlsQualityOptions: HlsQualityOption[];
  selectedHlsLevel: number;
  onSelectHlsLevel: (levelIndex: number, qualityLabel?: VideoQualityPref) => void;
  servers?: VideoServer[];
  selectedServerId?: string;
  onSelectServer?: (server: VideoServer) => void;
  // Subtitles & editor
  subtitleTracks: SubtitleTrackSummary[];
  activeSubLang: string;
  onChangeSubLang: (lang: string) => void;
  cues: SubtitleCue[];
  currentTime: number;
  onUpdateCues: (nextCues: SubtitleCue[]) => void;
  onResetCues?: () => void;
  // Optional extras
  ambientEnabled?: boolean;
  onToggleAmbient?: () => void;
  onToggleNativePip?: () => void;
  onOpenFullPlayer?: () => void;
  onOpenShortcuts?: () => void;
  compact?: boolean;
}

const SUBTITLE_COLORS = [
  { id: '#ffffff', label: 'White' },
  { id: '#fde047', label: 'Amber' },
  { id: '#67e8f9', label: 'Cyan' },
  { id: '#86efac', label: 'Mint' },
  { id: '#fca5a5', label: 'Coral' },
];

const STANDARD_QUALITIES: VideoQualityPref[] = ['auto', '1080p', '720p', '480p', '360p'];

export const PlayerSettingsPopover: React.FC<PlayerSettingsPopoverProps> = ({
  open,
  onClose,
  playerPrefs,
  onUpdatePrefs,
  speed,
  onChangeSpeed,
  muted,
  onToggleMute,
  hlsQualityOptions,
  selectedHlsLevel,
  onSelectHlsLevel,
  servers,
  selectedServerId,
  onSelectServer,
  subtitleTracks,
  activeSubLang,
  onChangeSubLang,
  cues,
  currentTime,
  onUpdateCues,
  onResetCues,
  ambientEnabled,
  onToggleAmbient,
  onToggleNativePip,
  onOpenFullPlayer,
  onOpenShortcuts,
  compact = false,
}) => {
  const [activeTab, setActiveTab] = useState<PlayerSettingsTab>('playback');
  const [importOpen, setImportOpen] = useState(false);
  const [importDraft, setImportDraft] = useState('');

  const activeCueIndex = useMemo(() => {
    const shifted = currentTime - (playerPrefs.subtitleOffsetSeconds || 0);
    return cues.findIndex((c) => shifted >= c.start && shifted <= c.end);
  }, [cues, currentTime, playerPrefs.subtitleOffsetSeconds]);

  if (!open) return null;

  const handleCueTextChange = (idx: number, nextText: string) => {
    const updated = cues.map((cue, i) => (i === idx ? { ...cue, text: nextText } : cue));
    onUpdateCues(updated);
  };

  const handleAddCueAtCurrentTime = () => {
    const start = Math.max(0, Math.round(currentTime * 10) / 10);
    const end = Math.round((start + 4) * 10) / 10;
    const next = [...cues, { start, end, text: 'Custom subtitle line' }].sort(
      (a, b) => a.start - b.start,
    );
    onUpdateCues(next);
  };

  const handleImportSubtitles = () => {
    const parsed = parseSubtitleText(importDraft);
    if (parsed.length > 0) {
      onUpdateCues(parsed);
      onUpdatePrefs({ subtitleEnabled: true });
      setImportDraft('');
      setImportOpen(false);
    }
  };

  return (
    <div
      data-no-gesture="true"
      data-testid="player-settings-popover"
      onClick={(e) => e.stopPropagation()}
      className={`sx-player-popover absolute z-40 rounded-2xl bg-zinc-950/75 backdrop-blur-2xl backdrop-saturate-150 border border-white/20 ring-1 ring-inset ring-white/10 shadow-2xl text-white overflow-hidden flex flex-col ${
        compact
          ? 'top-11 right-2.5 w-[min(20rem,calc(100vw-2rem))] max-h-[min(66vh,380px)]'
          : 'top-14 right-3 sm:right-5 w-80 sm:w-96 max-w-[calc(100vw-1.5rem)] max-h-[76vh]'
      }`}
    >
      {/* Tab Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-white/12 shrink-0">
        <div className="flex items-center gap-1 bg-white/10 p-0.5 rounded-xl flex-1">
          {(
            [
              { id: 'playback', label: 'Playback', Icon: SlidersHorizontal },
              { id: 'quality', label: 'Quality', Icon: Tv },
              { id: 'subtitles', label: 'Subtitles', Icon: Subtitles },
            ] as const
          ).map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                data-testid={`player-settings-tab-${id}`}
                onClick={() => setActiveTab(id)}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-[11px] font-extrabold transition-all ${
                  active
                    ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] shadow-sm'
                    : 'text-white/75 hover:text-white hover:bg-white/8'
                }`}
              >
                <Icon className="w-3 h-3 shrink-0" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-label="Close player settings"
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-white/10 text-white/75 hover:text-white transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable Tab Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
        <div key={activeTab} className="sx-player-tab-body space-y-3">
        {/* ==================== TAB 1: PLAYBACK ==================== */}
        {activeTab === 'playback' && (
          <div className="space-y-3">
            {/* Auto Play / Auto Next / Auto Skip Switches */}
            <div className="space-y-1.5 bg-white/5 rounded-xl p-2 border border-white/10">
              <button
                type="button"
                data-testid="settings-toggle-autoplay"
                aria-pressed={playerPrefs.autoPlay}
                onClick={() => onUpdatePrefs({ autoPlay: !playerPrefs.autoPlay })}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
              >
                <span className="text-[11px] font-bold">Auto Play on Open</span>
                <span
                  className={`w-8 h-4.5 rounded-full p-0.5 transition-colors flex items-center ${
                    playerPrefs.autoPlay
                      ? 'bg-[var(--sx-player-accent)] justify-end'
                      : 'bg-white/20 justify-start'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-zinc-950 shadow" />
                </span>
              </button>

              <button
                type="button"
                data-testid="settings-toggle-autonext"
                aria-pressed={playerPrefs.autoNextEpisode}
                onClick={() => onUpdatePrefs({ autoNextEpisode: !playerPrefs.autoNextEpisode })}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
              >
                <span className="text-[11px] font-bold">Auto Next Episode</span>
                <span
                  className={`w-8 h-4.5 rounded-full p-0.5 transition-colors flex items-center ${
                    playerPrefs.autoNextEpisode
                      ? 'bg-[var(--sx-player-accent)] justify-end'
                      : 'bg-white/20 justify-start'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-zinc-950 shadow" />
                </span>
              </button>

              <button
                type="button"
                data-testid="settings-toggle-autoskip"
                aria-pressed={playerPrefs.autoSkipOp || playerPrefs.autoSkipEd}
                onClick={() => {
                  const next = !(playerPrefs.autoSkipOp || playerPrefs.autoSkipEd);
                  onUpdatePrefs({ autoSkipOp: next, autoSkipEd: next });
                }}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
              >
                <span className="text-[11px] font-bold">Auto Skip OP / ED</span>
                <span
                  className={`w-8 h-4.5 rounded-full p-0.5 transition-colors flex items-center ${
                    playerPrefs.autoSkipOp || playerPrefs.autoSkipEd
                      ? 'bg-[var(--sx-player-accent)] justify-end'
                      : 'bg-white/20 justify-start'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-zinc-950 shadow" />
                </span>
              </button>

              <button
                type="button"
                data-testid="settings-toggle-autopip"
                aria-pressed={playerPrefs.autoPip}
                onClick={() => onUpdatePrefs({ autoPip: !playerPrefs.autoPip })}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
              >
                <span className="text-[11px] font-bold">Auto PiP on Leave</span>
                <span
                  className={`w-8 h-4.5 rounded-full p-0.5 transition-colors flex items-center ${
                    playerPrefs.autoPip
                      ? 'bg-[var(--sx-player-accent)] justify-end'
                      : 'bg-white/20 justify-start'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-zinc-950 shadow" />
                </span>
              </button>
            </div>

            {/* Video Fit Mode */}
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-white/55 mb-1.5">
                Video Fit
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'contain', label: 'Fit (Full)' },
                    { id: 'cover', label: 'Zoom' },
                    { id: 'fill', label: 'Stretch' },
                  ] as Array<{ id: VideoFitMode; label: string }>
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    data-testid={`settings-fit-${mode.id}`}
                    onClick={() => onUpdatePrefs({ videoFit: mode.id })}
                    className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition-colors ${
                      playerPrefs.videoFit === mode.id
                        ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)]'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Playback Speed */}
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-white/55 mb-1.5">
                Playback Speed
              </p>
              <div className="grid grid-cols-5 gap-1">
                {[0.75, 1, 1.25, 1.5, 2].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      onChangeSpeed(r);
                      onUpdatePrefs({ defaultSpeed: r });
                    }}
                    className={`py-1.5 rounded-lg text-[10px] font-extrabold tabular-nums transition-colors ${
                      speed === r
                        ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)]'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {r}×
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Utilities */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={onToggleMute}
                className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-bold"
              >
                {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                <span>{muted ? 'Muted' : 'Audio On'}</span>
              </button>

              {onToggleAmbient && (
                <button
                  type="button"
                  onClick={onToggleAmbient}
                  className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl text-[11px] font-bold ${
                    ambientEnabled
                      ? 'bg-[var(--sx-player-accent)]/20 text-[var(--sx-player-accent)] border border-[var(--sx-player-accent)]/40'
                      : 'bg-white/10 text-white/75'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Ambient {ambientEnabled ? 'On' : 'Off'}</span>
                </button>
              )}

              {onOpenShortcuts && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenShortcuts();
                  }}
                  className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-bold"
                >
                  <Keyboard className="w-3.5 h-3.5" />
                  <span>Shortcuts</span>
                </button>
              )}

              {onToggleNativePip && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onToggleNativePip();
                  }}
                  className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-bold"
                >
                  <PictureInPicture2 className="w-3.5 h-3.5" />
                  <span>Window PiP</span>
                </button>
              )}
            </div>

            {onOpenFullPlayer && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFullPlayer();
                }}
                className="w-full py-2 px-3 rounded-xl bg-white/12 hover:bg-white/20 text-[11px] font-extrabold flex items-center justify-center gap-1.5 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Dedicated Player</span>
              </button>
            )}
          </div>
        )}

        {/* ==================== TAB 2: QUALITY & STREAM ==================== */}
        {activeTab === 'quality' && (
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-white/55 mb-1.5">
                Video Quality {hlsQualityOptions.length > 1 ? '(Live HLS)' : '(Preferred)'}
              </p>
              <div className="space-y-1">
                {hlsQualityOptions.length > 1
                  ? hlsQualityOptions.map((opt) => {
                      const active = selectedHlsLevel === opt.index;
                      const prefMatch = (
                        opt.index === -1 ? 'auto' : opt.label.toLowerCase()
                      ) as VideoQualityPref;
                      return (
                        <button
                          key={`${opt.index}-${opt.label}`}
                          type="button"
                          data-testid={`quality-option-${opt.label.toLowerCase()}`}
                          onClick={() => {
                            const normalizedPref: VideoQualityPref = STANDARD_QUALITIES.includes(
                              prefMatch,
                            )
                              ? prefMatch
                              : 'auto';
                            onSelectHlsLevel(opt.index, normalizedPref);
                            onUpdatePrefs({ defaultQuality: normalizedPref });
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[11px] font-bold transition-colors ${
                            active
                              ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)]'
                              : 'bg-white/8 text-white hover:bg-white/15'
                          }`}
                        >
                          <span>
                            {opt.label}
                            {opt.index === -1 ? ' (Adaptive)' : ''}
                          </span>
                          {active && <Check className="w-3.5 h-3.5" />}
                        </button>
                      );
                    })
                  : STANDARD_QUALITIES.map((q) => {
                      const active = playerPrefs.defaultQuality === q;
                      return (
                        <button
                          key={q}
                          type="button"
                          data-testid={`quality-option-${q}`}
                          onClick={() => {
                            onSelectHlsLevel(-1, q);
                            onUpdatePrefs({ defaultQuality: q });
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[11px] font-bold uppercase transition-colors ${
                            active
                              ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)]'
                              : 'bg-white/8 text-white hover:bg-white/15'
                          }`}
                        >
                          <span>{q === 'auto' ? 'Auto (Adaptive)' : q}</span>
                          {active && <Check className="w-3.5 h-3.5" />}
                        </button>
                      );
                    })}
              </div>
            </div>

            {servers && servers.length > 0 && onSelectServer && (
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-white/55 mb-1.5">
                  Stream Mirror
                </p>
                <div className="space-y-1">
                  {servers.map((srv) => {
                    const active = srv.id === selectedServerId;
                    return (
                      <button
                        key={srv.id}
                        type="button"
                        onClick={() => onSelectServer(srv)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[11px] font-bold transition-colors ${
                          active
                            ? 'bg-white text-zinc-950'
                            : 'bg-white/8 text-white/90 hover:bg-white/15'
                        }`}
                      >
                        <span className="truncate">{srv.name}</span>
                        <span className="text-[9px] uppercase opacity-75">{srv.category}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 3: SUBTITLES EDITOR ==================== */}
        {activeTab === 'subtitles' && (
          <div className="space-y-3">
            {/* Enable & Track */}
            <div className="flex items-center justify-between gap-2 bg-white/5 rounded-xl p-2 border border-white/10">
              <button
                type="button"
                data-testid="settings-toggle-subtitles"
                aria-pressed={playerPrefs.subtitleEnabled}
                onClick={() =>
                  onUpdatePrefs({ subtitleEnabled: !playerPrefs.subtitleEnabled })
                }
                className="flex items-center gap-2 text-[11px] font-bold"
              >
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                    playerPrefs.subtitleEnabled
                      ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)]'
                      : 'bg-white/15 text-white/70'
                  }`}
                >
                  {playerPrefs.subtitleEnabled ? 'CC ON' : 'CC OFF'}
                </span>
                <span>Subtitles</span>
              </button>

              <div className="flex items-center gap-1">
                {subtitleTracks.map((tr) => (
                  <button
                    key={tr.lang}
                    type="button"
                    onClick={() => {
                      onChangeSubLang(tr.lang);
                      if (!playerPrefs.subtitleEnabled) {
                        onUpdatePrefs({ subtitleEnabled: true });
                      }
                    }}
                    className={`px-2 py-1 rounded-lg text-[10px] font-extrabold uppercase transition-colors ${
                      activeSubLang === tr.lang
                        ? 'bg-white text-zinc-950'
                        : 'bg-white/10 text-white/75 hover:bg-white/20'
                    }`}
                  >
                    {tr.lang}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size & Background */}
            <div className="space-y-2 bg-white/5 rounded-xl p-2.5 border border-white/10">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span>Font Size</span>
                <span className="font-mono-tabular text-[var(--sx-player-accent)]">
                  {playerPrefs.subtitleSize}px
                </span>
              </div>
              <input
                type="range"
                aria-label="Subtitle font size"
                min={12}
                max={30}
                step={1}
                value={playerPrefs.subtitleSize}
                onChange={(e) => onUpdatePrefs({ subtitleSize: Number(e.target.value) })}
                className="w-full accent-[var(--sx-player-accent)] cursor-pointer"
              />

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] font-bold">Color</span>
                <div className="flex items-center gap-1.5">
                  {SUBTITLE_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      aria-label={`Subtitle color ${c.label}`}
                      onClick={() => onUpdatePrefs({ subtitleColor: c.id })}
                      style={{ backgroundColor: c.id }}
                      className={`w-5 h-5 rounded-full border-2 transition-transform ${
                        playerPrefs.subtitleColor === c.id
                          ? 'border-[var(--sx-player-accent)] scale-110'
                          : 'border-white/30'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    onUpdatePrefs({ subtitleBackground: !playerPrefs.subtitleBackground })
                  }
                  className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold transition-colors ${
                    playerPrefs.subtitleBackground
                      ? 'bg-[var(--sx-player-accent)]/20 text-[var(--sx-player-accent)] border border-[var(--sx-player-accent)]/40'
                      : 'bg-white/10 text-white/75'
                  }`}
                >
                  Backdrop: {playerPrefs.subtitleBackground ? 'Box' : 'Outline'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdatePrefs({
                      subtitlePosition: (playerPrefs.subtitlePosition === 'top'
                        ? 'bottom'
                        : 'top') as SubtitlePosition,
                    })
                  }
                  className="flex-1 py-1.5 px-2 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold capitalize"
                >
                  Pos: {playerPrefs.subtitlePosition}
                </button>
              </div>
            </div>

            {/* Timing Sync Offset */}
            <div className="flex items-center justify-between gap-2 bg-white/5 rounded-xl p-2.5 border border-white/10">
              <div>
                <p className="text-[11px] font-bold">Timing Sync</p>
                <p className="text-[10px] font-mono-tabular text-[var(--sx-player-accent)]">
                  {playerPrefs.subtitleOffsetSeconds >= 0 ? '+' : ''}
                  {playerPrefs.subtitleOffsetSeconds.toFixed(1)}s
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onUpdatePrefs({
                      subtitleOffsetSeconds:
                        Math.round((playerPrefs.subtitleOffsetSeconds - 0.5) * 10) / 10,
                    })
                  }
                  className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold"
                >
                  -0.5s
                </button>
                <button
                  type="button"
                  onClick={() => onUpdatePrefs({ subtitleOffsetSeconds: 0 })}
                  className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold"
                >
                  0s
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdatePrefs({
                      subtitleOffsetSeconds:
                        Math.round((playerPrefs.subtitleOffsetSeconds + 0.5) * 10) / 10,
                    })
                  }
                  className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold"
                >
                  +0.5s
                </button>
              </div>
            </div>

            {/* Live Subtitle Cues Editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-white/55">
                  Edit Subtitle Lines ({cues.length})
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    data-testid="sub-add-cue-btn"
                    onClick={handleAddCueAtCurrentTime}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold"
                    title="Add line at current time"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportOpen((v) => !v)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold"
                    title="Paste SRT / VTT"
                  >
                    <Upload className="w-3 h-3" />
                    <span>SRT</span>
                  </button>
                  {onResetCues && (
                    <button
                      type="button"
                      onClick={onResetCues}
                      className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/75"
                      title="Reset subtitles"
                      aria-label="Reset subtitles"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {importOpen && (
                <div className="space-y-1.5 p-2 rounded-xl bg-white/8 border border-white/15">
                  <textarea
                    rows={3}
                    value={importDraft}
                    onChange={(e) => setImportDraft(e.target.value)}
                    placeholder="Paste .srt or .vtt cues here..."
                    className="w-full rounded-lg bg-black/50 border border-white/15 p-2 text-[11px] font-mono-tabular text-white focus:outline-none focus:border-[var(--sx-player-accent)]"
                  />
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setImportOpen(false)}
                      className="px-2.5 py-1 rounded-lg bg-white/10 text-[10px] font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleImportSubtitles}
                      className="px-2.5 py-1 rounded-lg bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] text-[10px] font-extrabold"
                    >
                      Apply Cues
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                {cues.map((cue, idx) => {
                  const isLive = idx === activeCueIndex;
                  return (
                    <div
                      key={`${cue.start}-${idx}`}
                      className={`p-2 rounded-xl border space-y-1 transition-colors ${
                        isLive
                          ? 'bg-[var(--sx-player-accent)]/15 border-[var(--sx-player-accent)]/45'
                          : 'bg-white/5 border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono-tabular text-white/60">
                        <span>
                          {formatPlayerTime(cue.start)} → {formatPlayerTime(cue.end)}
                        </span>
                        {isLive && (
                          <span className="text-[9px] font-extrabold uppercase text-[var(--sx-player-accent)]">
                            Active
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        aria-label={`Subtitle line ${idx + 1}`}
                        data-testid={`sub-cue-input-${idx}`}
                        value={cue.text}
                        onChange={(e) => handleCueTextChange(idx, e.target.value)}
                        className="w-full bg-black/45 border border-white/10 rounded-lg px-2 py-1 text-[11px] font-medium text-white focus:outline-none focus:border-[var(--sx-player-accent)]"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};
