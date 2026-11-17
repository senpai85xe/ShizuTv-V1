import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Check,
  Download,
  Loader2,
  LogIn,
  Upload,
  RotateCcw,
  Trash2,
  Plus,
  Lock,
  ShieldCheck,
  Terminal,
  Sparkles,
  ExternalLink,
  Copy,
  Eye,
  EyeOff,
  Play,
  BookOpen,
  UserCheck,
  AlertTriangle,
  List,
  LayoutGrid,
  Hash,
  AlignJustify,
  RectangleHorizontal,
  Globe,
  RefreshCw,
  Search,
  Activity,
} from 'lucide-react';
import {
  BackupManifest,
  DEFAULT_HOME_SECTIONS,
  useApp,
} from '../store/AppContext';
import {
  BackgroundGradientStyle,
  BUILT_IN_PRESETS,
  EPISODE_CHAPTER_STYLES,
  EpisodeChapterStyle,
  EXCLUSIVE_SCHEMES,
  HERO_BANNER_STYLES,
  HomeHeaderStyle,
  MEDIA_CARD_STYLES,
  MediaCardStyle,
  ThemeMode,
} from '../data/themePresets';
import {
  AdultContentMode,
  ExtensionRepo,
  HomeSection,
  TitlePreference,
  TrackedStatus,
  TrackerType,
  UnifiedMedia,
} from '../types/media';
import { MediaCard } from '../components/MediaCard';
import { HeroBannerCarousel } from '../components/HeroBannerCarousel';
import {
  EpisodeChapterList,
  EpisodeChapterListItem,
} from '../components/EpisodeChapterList';
import { resolveEpisodeChapterStyle } from '../utils/episodeChapterStyle';
import { NAV_BAR_STYLE_OPTIONS } from '../utils/navBarStyles';
import { ShonenXLogo } from '../components/ShonenXLogo';
import { ScrollReveal } from '../components/ScrollReveal';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { getBoundedStaggerDelay } from '../utils/appMotion';
import { clearOfflineCaches } from '../utils/recentContentCache';
import { resolveEffectiveStreamQuality } from '../utils/inlinePlayer';
import {
  buildAniListTokenAuthorizeUrl,
  fetchAniListOAuthStatus,
} from '../services/anilistAuth';

const PREVIEW_SAMPLE_MEDIA: UnifiedMedia = {
  id: '21',
  type: 'ANIME',
  title: {
    english: 'One Piece',
    romaji: 'ONE PIECE',
    native: 'ワンピース',
  },
  format: 'TV',
  year: 1999,
  score: 8.8,
  episodes: 1122,
  genres: ['Adventure', 'Action'],
  description:
    'Monkey D. Luffy sails across the Grand Line with his Straw Hat crew to claim the legendary One Piece.',
  cover: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg',
  banner: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21-wf37VakJmZqs.jpg',
};

const PREVIEW_EPISODE_ITEMS: EpisodeChapterListItem[] = [
  {
    id: 'preview-ep-1',
    number: 1,
    title: 'The Battle Begins',
    meta: '1mo ago · Sub & Dub',
    thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/16498-8jpFCOcDmneX.jpg',
    isCurrent: true,
  },
  {
    id: 'preview-ep-2',
    number: 2,
    title: 'The Journey Begins',
    meta: '3w ago · Sub & Dub',
    thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21-wf37VakJmZqs.jpg',
    isNew: true,
  },
  {
    id: 'preview-ep-3',
    number: 3,
    title: 'First Encounter',
    meta: '2w ago · Sub & Dub',
    thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/1535.jpg',
  },
  {
    id: 'preview-ep-4',
    number: 4,
    title: 'Day of Atonement',
    meta: '1w ago · Sub & Dub',
    thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg',
  },
];

const PREVIEW_CHAPTER_ITEMS: EpisodeChapterListItem[] = [
  {
    id: 'preview-ch-1',
    number: 1,
    title: 'Romance Dawn',
    meta: 'Official Release · 24 pages',
    thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21-wf37VakJmZqs.jpg',
    isCurrent: true,
  },
  {
    id: 'preview-ch-2',
    number: 2,
    title: 'They Call Him Straw Hat',
    meta: 'Official Release · 19 pages',
    thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/16498-8jpFCOcDmneX.jpg',
    isNew: true,
  },
  {
    id: 'preview-ch-3',
    number: 3,
    title: 'Morgan vs. Luffy',
    meta: 'ShizuTv Scanlations · 20 pages',
    thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/1535.jpg',
  },
  {
    id: 'preview-ch-4',
    number: 4,
    title: 'The Pirate Captain',
    meta: 'ShizuTv Scanlations · 18 pages',
    thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg',
  },
];

const PREVIEW_HERO_MEDIA: UnifiedMedia[] = [
  PREVIEW_SAMPLE_MEDIA,
  {
    id: '1535',
    type: 'ANIME',
    title: {
      english: 'Death Note',
      romaji: 'DEATH NOTE',
    },
    format: 'TV',
    year: 2006,
    score: 8.4,
    episodes: 37,
    genres: ['Mystery', 'Psychological'],
    description:
      'A high school genius discovers a supernatural notebook that grants the power to end any life whose name is written inside.',
    cover: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1535-lawCwhzhi96X.jpg',
    banner: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/1535.jpg',
  },
  {
    id: '16498',
    type: 'ANIME',
    title: {
      english: 'Attack on Titan',
      romaji: 'Shingeki no Kyojin',
    },
    format: 'TV',
    year: 2013,
    score: 8.5,
    episodes: 25,
    genres: ['Action', 'Drama'],
    description:
      'Humanity fights for survival behind towering walls against colossal man-eating Titans.',
    cover: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-73IhOXpJZiMF.jpg',
    banner: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/16498-8jpFCOcDmneX.jpg',
  },
];

const SettingsShell: React.FC<{
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, action, children }) => {
  const navigate = useNavigate();
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6">
      <div className="flex items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="p-2 rounded-xl bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)] transition-colors shrink-0"
            aria-label="Back to Settings"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight truncate">{title}</h1>
            {subtitle && (
              <p className="text-xs text-[var(--sx-on-surface-muted)] mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
};

const ToggleRow: React.FC<{
  label: string;
  description?: string;
  checked: boolean;
  onChange: (val: boolean) => void;
  testId?: string;
}> = ({ label, description, checked, onChange, testId }) => (
  <button
    type="button"
    data-testid={testId}
    aria-pressed={checked}
    onClick={() => onChange(!checked)}
    className="w-full flex items-center justify-between gap-4 px-4 py-3.5 text-left hover:bg-[var(--sx-surface-high)] transition-colors"
  >
    <div className="min-w-0">
      <div className="text-sm font-bold text-[var(--sx-on-surface)]">{label}</div>
      {description && (
        <p className="text-xs text-[var(--sx-on-surface-muted)] mt-0.5">{description}</p>
      )}
    </div>
    <div
      className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${
        checked ? 'bg-[var(--sx-primary)]' : 'bg-[var(--sx-surface-high)] border border-[var(--sx-outline)]'
      }`}
    >
      <div
        className={`w-5 h-5 rounded-full transition-transform ${
          checked
            ? 'translate-x-5 bg-[var(--sx-on-primary)]'
            : 'translate-x-0 bg-[var(--sx-on-surface-muted)]'
        }`}
      />
    </div>
  </button>
);

export const ThemeSettingsPage: React.FC = () => {
  const { state, updateThemePrefs, applyPreset } = useApp();
  const { themePrefs } = state;
  const roundness = `${themePrefs.uiRoundness}px`;

  return (
    <SettingsShell
      title="Theme & Appearance"
      subtitle="Presets, 23 exclusive palettes, AMOLED mode, gradients & textures"
    >
      {/* Built-In Theme Presets */}
      <ScrollReveal index={0}>
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
            <Sparkles className="w-3.5 h-3.5 text-[var(--sx-primary)]" />
            <span>Curated Presets</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {BUILT_IN_PRESETS.map((preset, idx) => {
              const active = themePrefs.activePresetId === preset.id;
              const delay = getBoundedStaggerDelay(idx, 22, 9);
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  style={{
                    borderRadius: roundness,
                    ...(delay > 0 ? { animationDelay: `${delay}ms` } : {}),
                  }}
                  className={`sx-card-animate sx-card-spring p-4 text-left border ${
                    active
                      ? 'bg-[var(--sx-primary)]/12 border-[var(--sx-primary)]'
                      : 'bg-[var(--sx-surface-container)] border-[var(--sx-outline)] hover:border-[var(--sx-primary)]/50'
                  }`}
                >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {preset.previewColors.map((hex, idx) => (
                      <span
                        key={idx}
                        className="w-4 h-4 rounded-full border border-white/20"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                  {active && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--sx-primary)]">
                      <Check className="w-3 h-3" /> Active
                    </span>
                  )}
                </div>
                <div className="mt-3 text-sm font-extrabold">{preset.name}</div>
                <p className="text-[11px] text-[var(--sx-on-surface-muted)] mt-1 line-clamp-2">
                  {preset.description}
                </p>
                <div className="mt-2 text-[10px] font-mono-tabular text-[var(--sx-on-surface-muted)]">
                  {preset.author} · {preset.cardStyle}
                </div>
              </button>
            );
          })}
          </div>
        </section>
      </ScrollReveal>

      {/* Theme Mode & Surface */}
      <ScrollReveal index={1}>
        <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
          Mode & Surface
        </h2>
        <div
          style={{ borderRadius: roundness }}
          className="bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden"
        >
          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold">Theme Mode</div>
              <p className="text-xs text-[var(--sx-on-surface-muted)]">
                Switch between Dark, Light, or match your OS preference
              </p>
            </div>
            <div className="flex items-center gap-1.5 bg-[var(--sx-surface-high)] p-1 rounded-xl">
              {(['dark', 'light', 'system'] as ThemeMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updateThemePrefs({ themeMode: mode })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors ${
                    themePrefs.themeMode === mode
                      ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                      : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <ToggleRow
            label="Pitch-Black AMOLED Surface"
            description="Uses pure #000000 backgrounds in Dark mode for OLED displays"
            checked={themePrefs.useAmoled}
            onChange={(useAmoled) => updateThemePrefs({ useAmoled })}
          />

          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span>UI Corner Roundness</span>
              <span className="font-mono-tabular text-[var(--sx-primary)]">
                {themePrefs.uiRoundness}px
              </span>
            </div>
            <input
              type="range"
              min={4}
              max={24}
              step={2}
              value={themePrefs.uiRoundness}
              onChange={(e) => updateThemePrefs({ uiRoundness: Number(e.target.value) })}
              className="w-full accent-[var(--sx-primary)]"
            />
          </div>
        </div>
        </section>
      </ScrollReveal>

      {/* Atmospheric Background & Noise */}
      <ScrollReveal index={2}>
        <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
          Atmosphere & Texture
        </h2>
        <div
          style={{ borderRadius: roundness }}
          className="bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden"
        >
          <ToggleRow
            label="Ambient Background Gradients"
            description="Subtle primary/secondary glow washes across screens"
            checked={themePrefs.useGradients}
            onChange={(useGradients) => updateThemePrefs({ useGradients })}
          />
          {themePrefs.useGradients && (
            <div className="p-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                {(['topGlow', 'radial', 'linear', 'none'] as BackgroundGradientStyle[]).map(
                  (style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => updateThemePrefs({ gradientStyle: style })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        themePrefs.gradientStyle === style
                          ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                          : 'bg-[var(--sx-surface-high)] text-[var(--sx-on-surface-muted)]'
                      }`}
                    >
                      {style}
                    </button>
                  ),
                )}
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span>Gradient Intensity</span>
                  <span className="font-mono-tabular">
                    {Math.round(themePrefs.gradientIntensity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={themePrefs.gradientIntensity}
                  onChange={(e) =>
                    updateThemePrefs({ gradientIntensity: Number(e.target.value) })
                  }
                  className="w-full accent-[var(--sx-primary)]"
                />
              </div>
            </div>
          )}

          <ToggleRow
            label="Film Grain / Noise Overlay"
            description="Adds subtle analog texture over background surfaces"
            checked={themePrefs.useNoiseOverlay}
            onChange={(useNoiseOverlay) => updateThemePrefs({ useNoiseOverlay })}
          />
          {themePrefs.useNoiseOverlay && (
            <div className="p-4 space-y-1.5">
              <div className="flex justify-between text-xs font-bold">
                <span>Noise Opacity</span>
                <span className="font-mono-tabular">
                  {Math.round(themePrefs.noiseOpacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.02}
                max={0.2}
                step={0.01}
                value={themePrefs.noiseOpacity}
                onChange={(e) => updateThemePrefs({ noiseOpacity: Number(e.target.value) })}
                className="w-full accent-[var(--sx-primary)]"
              />
            </div>
          )}
        </div>
        </section>
      </ScrollReveal>

      {/* 23 Exclusive Schemes */}
      <ScrollReveal index={3}>
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
            Exclusive Color Schemes ({EXCLUSIVE_SCHEMES.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {EXCLUSIVE_SCHEMES.map((scheme) => {
              const active = themePrefs.exclusiveScheme === scheme.id;
              return (
                <button
                  key={scheme.id}
                  type="button"
                  onClick={() => updateThemePrefs({ exclusiveScheme: scheme.id })}
                  style={{ borderRadius: roundness }}
                  className={`sx-card-spring p-3.5 text-left border flex items-center gap-3 ${
                    active
                      ? 'bg-[var(--sx-primary)]/12 border-[var(--sx-primary)]'
                      : 'bg-[var(--sx-surface-container)] border-[var(--sx-outline)] hover:border-[var(--sx-primary)]/50'
                  }`}
                >
                  <div className="flex -space-x-1.5 shrink-0">
                    <span
                      className="w-6 h-6 rounded-full border-2 border-[var(--sx-surface)]"
                      style={{ backgroundColor: scheme.dark.primary }}
                    />
                    <span
                      className="w-6 h-6 rounded-full border-2 border-[var(--sx-surface)]"
                      style={{ backgroundColor: scheme.dark.secondary }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-extrabold truncate">{scheme.name}</div>
                    <div className="text-[11px] text-[var(--sx-on-surface-muted)] truncate">
                      {scheme.description}
                    </div>
                  </div>
                  {active && <Check className="w-4 h-4 text-[var(--sx-primary)] shrink-0" />}
                </button>
              );
            })}
          </div>
        </section>
      </ScrollReveal>
    </SettingsShell>
  );
};

export const UiSettingsPage: React.FC = () => {
  const { state, updateUiPrefs } = useApp();
  const { uiPrefs } = state;
  const roundness = `${state.themePrefs.uiRoundness}px`;
  const [episodePreviewKind, setEpisodePreviewKind] = useState<'episode' | 'chapter'>('episode');
  const activeEpisodeStyle = resolveEpisodeChapterStyle(uiPrefs.episodeChapterStyle);

  const episodeStyleIcons: Record<EpisodeChapterStyle, React.FC<{ className?: string }>> = {
    classic: List,
    grid: LayoutGrid,
    box: Hash,
    compact: AlignJustify,
    cover: RectangleHorizontal,
  };

  const navStyles = NAV_BAR_STYLE_OPTIONS;

  const headerStyles: { id: HomeHeaderStyle; label: string }[] = [
    { id: 'prominent', label: 'Prominent' },
    { id: 'classic', label: 'Classic' },
    { id: 'material', label: 'Material' },
    { id: 'minimal', label: 'Minimal' },
    { id: 'docked', label: 'Docked' },
    { id: 'shizutv', label: 'ShizuTv' },
    { id: 'clean', label: 'Clean' },
    { id: 'cleanWave', label: 'Clean Wave' },
  ];

  return (
    <SettingsShell
      title="UI & Layout Styles"
      subtitle="Customize card framing, navigation shell, home header & TV mode"
    >
      {/* Live MediaCard Preview + Card Styles */}
      <ScrollReveal index={0}>
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
            Media Card Style ({MEDIA_CARD_STYLES.length})
          </h2>
          <div
            style={{ borderRadius: roundness }}
            className="p-5 bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] flex flex-col md:flex-row items-center gap-6"
          >
            <div className="shrink-0 flex flex-col items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--sx-on-surface-muted)]">
                Live Preview
              </span>
              <MediaCard
                media={PREVIEW_SAMPLE_MEDIA}
                style={uiPrefs.cardStyle}
                rank={uiPrefs.cardStyle === 'trendingRank' ? 1 : undefined}
                progressLabel={
                  uiPrefs.cardStyle === 'showcase' ||
                  uiPrefs.cardStyle === 'shizutv' ||
                  uiPrefs.cardStyle === 'trendingRank'
                    ? undefined
                    : uiPrefs.cardStyle === 'episodeTile'
                      ? 'Episode 1071'
                      : 'EP 1071 · 18:24'
                }
                progressPercent={
                  uiPrefs.cardStyle === 'showcase' ||
                  uiPrefs.cardStyle === 'shizutv' ||
                  uiPrefs.cardStyle === 'trendingRank'
                    ? undefined
                    : 0.76
                }
                subtitleRight={uiPrefs.cardStyle === 'episodeTile' ? '18m left' : undefined}
                onClick={() => {}}
              />
            </div>

            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 w-full">
              {MEDIA_CARD_STYLES.map((style, idx) => {
                const active = uiPrefs.cardStyle === style.id;
                const delay = getBoundedStaggerDelay(idx, 18, 12);
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() =>
                      updateUiPrefs({
                        cardStyle: style.id,
                      })
                    }
                    style={delay > 0 ? { animationDelay: `${delay}ms` } : undefined}
                    className={`sx-card-animate sx-card-spring p-3 rounded-xl border text-left ${
                      active
                        ? 'bg-[var(--sx-primary)]/15 border-[var(--sx-primary)]'
                        : 'bg-[var(--sx-surface-high)]/60 border-[var(--sx-outline)] hover:border-[var(--sx-primary)]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold">{style.name}</span>
                      {active && <Check className="w-3.5 h-3.5 text-[var(--sx-primary)]" />}
                    </div>
                    <p className="text-[11px] text-[var(--sx-on-surface-muted)] mt-1 line-clamp-2">
                      {style.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* Continue Row Card Overrides */}
      <ScrollReveal index={1}>
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
            Continue Row Card Overrides ({MEDIA_CARD_STYLES.length})
          </h2>
        <div
          style={{ borderRadius: roundness }}
          className="bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden"
        >
          <div className="p-5 flex flex-col sm:flex-row items-center gap-6">
            <div className="shrink-0 flex flex-col items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--sx-on-surface-muted)]">
                Continue Preview
              </span>
              <MediaCard
                media={PREVIEW_SAMPLE_MEDIA}
                style={uiPrefs.continueWatchingStyle}
                progressLabel={
                  uiPrefs.continueWatchingStyle === 'episodeTile'
                    ? 'Episode 1'
                    : 'EP 1 · 24m left'
                }
                progressPercent={0.35}
                subtitleRight="24m left"
                onRemove={() => {}}
                onClick={() => {}}
              />
            </div>

            <div className="flex-1 w-full space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold">Continue Watching Card</div>
                  <p className="text-xs text-[var(--sx-on-surface-muted)]">
                    Style used for anime history cards on Home
                  </p>
                </div>
                <select
                  aria-label="Continue Watching Card"
                  value={uiPrefs.continueWatchingStyle}
                  onChange={(e) =>
                    updateUiPrefs({ continueWatchingStyle: e.target.value as MediaCardStyle })
                  }
                  className="px-3 py-2 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-xs font-bold"
                >
                  {MEDIA_CARD_STYLES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="pt-4 border-t border-[var(--sx-outline)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold">Continue Reading Card</div>
                  <p className="text-xs text-[var(--sx-on-surface-muted)]">
                    Style used for manga history cards on Home
                  </p>
                </div>
                <select
                  aria-label="Continue Reading Card"
                  value={uiPrefs.continueReadingStyle}
                  onChange={(e) =>
                    updateUiPrefs({ continueReadingStyle: e.target.value as MediaCardStyle })
                  }
                  className="px-3 py-2 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-xs font-bold"
                >
                  {MEDIA_CARD_STYLES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          </div>
        </section>
      </ScrollReveal>

      {/* Hero Banner Style */}
      <ScrollReveal index={2}>
        <section className="space-y-3" aria-label="Hero Banner Style Settings">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
            Hero Banner Style ({HERO_BANNER_STYLES.length})
          </h2>
          <div
            style={{ borderRadius: roundness }}
            className="p-4 sm:p-5 bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] space-y-4 overflow-hidden"
          >
            <div className="space-y-2">
              <span className="block text-[10px] font-bold uppercase tracking-widest text-[var(--sx-on-surface-muted)]">
                Live Preview
              </span>
              <div className="-mx-2 sm:-mx-4">
                <HeroBannerCarousel
                  items={PREVIEW_HERO_MEDIA}
                  styleOverride={uiPrefs.heroBannerStyle}
                  onSelectMedia={() => {}}
                  onWatchNow={() => {}}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {HERO_BANNER_STYLES.map((style) => {
                const active = (uiPrefs.heroBannerStyle || 'classic') === style.id;
                return (
                  <button
                    key={style.id}
                    type="button"
                    data-testid={`hero-style-option-${style.id}`}
                    aria-pressed={active}
                    onClick={() => updateUiPrefs({ heroBannerStyle: style.id })}
                    className={`sx-card-spring p-3 rounded-xl border text-left ${
                      active
                        ? 'bg-[var(--sx-primary)]/15 border-[var(--sx-primary)]'
                        : 'bg-[var(--sx-surface-high)]/60 border-[var(--sx-outline)] hover:border-[var(--sx-primary)]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold">{style.name}</span>
                      {active && <Check className="w-3.5 h-3.5 text-[var(--sx-primary)] shrink-0" />}
                    </div>
                    <p className="text-[11px] text-[var(--sx-on-surface-muted)] mt-1 line-clamp-2">
                      {style.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* Episode & Chapter Style */}
      <ScrollReveal index={3}>
        <section className="space-y-3" aria-label="Episode and Chapter Style Settings">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
          Episode &amp; Chapter Style ({EPISODE_CHAPTER_STYLES.length})
        </h2>
        <div
          style={{ borderRadius: roundness }}
          className="p-4 sm:p-5 bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] space-y-4 overflow-hidden"
        >
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--sx-on-surface-muted)]">
                Live Preview
              </span>
              <div className="inline-flex items-center p-0.5 rounded-lg bg-[var(--sx-surface-high)] border border-[var(--sx-outline)]">
                <button
                  type="button"
                  onClick={() => setEpisodePreviewKind('episode')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                    episodePreviewKind === 'episode'
                      ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                      : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                  }`}
                >
                  Episodes
                </button>
                <button
                  type="button"
                  onClick={() => setEpisodePreviewKind('chapter')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                    episodePreviewKind === 'chapter'
                      ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                      : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                  }`}
                >
                  Chapters
                </button>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-[var(--sx-surface)]/55 border border-[var(--sx-outline)]/60">
              <EpisodeChapterList
                items={
                  episodePreviewKind === 'chapter'
                    ? PREVIEW_CHAPTER_ITEMS
                    : PREVIEW_EPISODE_ITEMS
                }
                unitLabel={episodePreviewKind === 'chapter' ? 'CHAPTER' : 'EPISODE'}
                style={activeEpisodeStyle}
                isManga={episodePreviewKind === 'chapter'}
                previewMode
                onSelectItem={() => {}}
                onDownloadItem={() => {}}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {EPISODE_CHAPTER_STYLES.map((style) => {
              const active = activeEpisodeStyle === style.id;
              const Icon = episodeStyleIcons[style.id];
              return (
                <button
                  key={style.id}
                  type="button"
                  data-testid={`episode-style-option-${style.id}`}
                  aria-pressed={active}
                  onClick={() => updateUiPrefs({ episodeChapterStyle: style.id })}
                  className={`sx-card-spring p-3 rounded-xl border text-left ${
                    active
                      ? 'bg-[var(--sx-primary)]/15 border-[var(--sx-primary)]'
                      : 'bg-[var(--sx-surface-high)]/60 border-[var(--sx-outline)] hover:border-[var(--sx-primary)]/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-xs font-extrabold">
                      <Icon className="w-3.5 h-3.5 text-[var(--sx-primary)] shrink-0" />
                      <span>{style.name}</span>
                    </span>
                    {active && <Check className="w-3.5 h-3.5 text-[var(--sx-primary)] shrink-0" />}
                  </div>
                  <p className="text-[11px] text-[var(--sx-on-surface-muted)] mt-1 line-clamp-2">
                    {style.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
        </section>
      </ScrollReveal>

      {/* Navigation & Header Styles + TV Mode */}
      <ScrollReveal index={4}>
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
            Navigation, Header & TV Mode
          </h2>
          <div
            style={{ borderRadius: roundness }}
            className="bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden"
          >
            <div className="p-4 space-y-3">
              <div className="text-sm font-bold">Navigation Rail Style</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {navStyles.map((n) => {
                  const active = uiPrefs.navBarStyle === n.id;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      data-testid={`nav-style-option-${n.id}`}
                      aria-pressed={active}
                      onClick={() => updateUiPrefs({ navBarStyle: n.id })}
                      className={`sx-card-spring p-3 rounded-xl border text-left transition-colors ${
                        active
                          ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] border-[var(--sx-primary)] shadow-sm'
                          : 'bg-[var(--sx-surface-high)] border-[var(--sx-outline)] hover:border-[var(--sx-primary)]/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-extrabold">{n.label}</span>
                        {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                      </div>
                      <p
                        className={`text-[10px] mt-1 line-clamp-2 ${
                          active ? 'opacity-90' : 'text-[var(--sx-on-surface-muted)]'
                        }`}
                      >
                        {n.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-4 space-y-3">
              <div className="text-sm font-bold">Home Header Style</div>
              <div className="flex flex-wrap gap-2">
                {headerStyles.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => updateUiPrefs({ homeHeaderStyle: h.id })}
                    className={`sx-card-spring px-3.5 py-2 rounded-xl text-xs font-bold border ${
                      uiPrefs.homeHeaderStyle === h.id
                        ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] border-[var(--sx-primary)]'
                        : 'bg-[var(--sx-surface-high)] border-[var(--sx-outline)]'
                    }`}
                  >
                    {h.label}
                  </button>
                ))}
              </div>
            </div>

            <ToggleRow
              label="TV / Big-Screen Mode (useNewUi)"
              description="Replaces the side rail with a top horizontal navigation bar designed for widescreen & remote navigation"
              checked={uiPrefs.useNewUi}
              onChange={(useNewUi) => updateUiPrefs({ useNewUi })}
            />
          </div>
        </section>
      </ScrollReveal>
    </SettingsShell>
  );
};

export const HomeSectionsSettingsPage: React.FC = () => {
  const { state, setHomeSections } = useApp();
  const [newStatus, setNewStatus] = useState<TrackedStatus>('PLANNING');
  const [newMediaType, setNewMediaType] = useState<'ANIME' | 'MANGA'>('ANIME');
  const roundness = `${state.themePrefs.uiRoundness}px`;

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= state.homeSections.length) return;
    const copy = [...state.homeSections];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    setHomeSections(copy);
  };

  const toggleDisabled = (id: string) => {
    setHomeSections(
      state.homeSections.map((s) => (s.id === id ? { ...s, disabled: !s.disabled } : s)),
    );
  };

  const removeSection = (id: string) => {
    setHomeSections(state.homeSections.filter((s) => s.id !== id));
  };

  const addLibrarySection = () => {
    const labelMap: Record<TrackedStatus, string> = {
      CURRENT: newMediaType === 'MANGA' ? 'Currently Reading' : 'Currently Watching',
      PLANNING: newMediaType === 'MANGA' ? 'Plan to Read' : 'Plan to Watch',
      COMPLETED: 'Completed',
      PAUSED: 'Paused',
      DROPPED: 'Dropped',
      REPEATING: newMediaType === 'MANGA' ? 'Rereading' : 'Rewatching',
    };
    const next: HomeSection = {
      id: `lib-${newMediaType.toLowerCase()}-${newStatus.toLowerCase()}-${Date.now()}`,
      title: `${labelMap[newStatus]} (${newMediaType === 'ANIME' ? 'Anime' : 'Manga'})`,
      type: 'libraryStatus',
      disabled: false,
      libraryStatus: newStatus,
      targetMediaType: newMediaType,
    };
    setHomeSections([...state.homeSections, next]);
  };

  return (
    <SettingsShell
      title="Home Sections"
      subtitle="Reorder, toggle visibility, or add custom Library shelf rows"
      action={
        <button
          type="button"
          onClick={() => setHomeSections(DEFAULT_HOME_SECTIONS)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] hover:border-[var(--sx-primary)] transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Default</span>
        </button>
      }
    >
      <div
        style={{ borderRadius: roundness }}
        className="bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden"
      >
        {state.homeSections.map((section, idx) => (
          <div key={section.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm font-bold truncate ${
                    section.disabled ? 'line-through text-[var(--sx-on-surface-muted)]' : ''
                  }`}
                >
                  {section.title}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--sx-surface-high)] text-[var(--sx-on-surface-muted)]">
                  {section.type}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                className="p-1.5 rounded-lg bg-[var(--sx-surface-high)] disabled:opacity-35 hover:text-[var(--sx-primary)]"
                aria-label="Move up"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => move(idx, 1)}
                disabled={idx === state.homeSections.length - 1}
                className="p-1.5 rounded-lg bg-[var(--sx-surface-high)] disabled:opacity-35 hover:text-[var(--sx-primary)]"
                aria-label="Move down"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => toggleDisabled(section.id)}
                className={`p-1.5 rounded-lg transition-colors ${
                  section.disabled
                    ? 'bg-[var(--sx-surface-high)] text-[var(--sx-on-surface-muted)]'
                    : 'bg-[var(--sx-primary)]/15 text-[var(--sx-primary)]'
                }`}
                aria-label="Toggle visibility"
              >
                {section.disabled ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              {section.type === 'libraryStatus' && (
                <button
                  type="button"
                  onClick={() => removeSection(section.id)}
                  className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  aria-label="Remove section"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add Library Shelf Section */}
      <div
        style={{ borderRadius: roundness }}
        className="p-4 bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div>
          <div className="text-sm font-bold">Add Library Shelf Row</div>
          <p className="text-xs text-[var(--sx-on-surface-muted)]">
            Pin a personal Watchlist or Reading status row onto your Home feed
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={newMediaType}
            onChange={(e) => setNewMediaType(e.target.value as 'ANIME' | 'MANGA')}
            className="px-3 py-2 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-xs font-bold"
          >
            <option value="ANIME">Anime</option>
            <option value="MANGA">Manga</option>
          </select>
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as TrackedStatus)}
            className="px-3 py-2 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-xs font-bold"
          >
            <option value="CURRENT">Current</option>
            <option value="PLANNING">Planning</option>
            <option value="COMPLETED">Completed</option>
            <option value="PAUSED">Paused</option>
            <option value="REPEATING">Repeating</option>
          </select>
          <button
            type="button"
            onClick={addLibrarySection}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-xs font-bold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Row</span>
          </button>
        </div>
      </div>
    </SettingsShell>
  );
};

export const TrackingSettingsPage: React.FC = () => {
  const {
    state,
    setPrimaryTracker,
    connectAniListToken,
    loginWithAniList,
    logoutAniList,
    updateDiscoveryPrefs,
  } = useApp();
  const [tokenInput, setTokenInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [configuredClientId, setConfiguredClientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const roundness = `${state.themePrefs.uiRoundness}px`;

  const anilistProfile = state.profiles.anilist;

  useEffect(() => {
    if (anilistProfile) return;
    let active = true;
    void fetchAniListOAuthStatus()
      .then((status) => {
        if (active && status.clientId) {
          setConfiguredClientId(status.clientId);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [anilistProfile]);

  const tokenAuthorizeUrl = buildAniListTokenAuthorizeUrl(configuredClientId);

  const handleOAuthLogin = async () => {
    setOauthBusy(true);
    setError(null);
    try {
      await loginWithAniList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AniList OAuth2 login failed');
    } finally {
      setOauthBusy(false);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    setConnecting(true);
    setError(null);
    try {
      await connectAniListToken(tokenInput);
      setTokenInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify AniList token');
    } finally {
      setConnecting(false);
    }
  };

  const trackers: { id: TrackerType; label: string; desc: string }[] = [
    { id: 'local', label: 'Local Offline', desc: 'Saved directly in browser storage' },
    { id: 'anilist', label: 'AniList', desc: 'GraphQL cloud sync & catalog metadata' },
    { id: 'myanimelist', label: 'MyAnimeList (Jikan)', desc: 'Jikan v4 public catalog metadata' },
    { id: 'kitsu', label: 'Kitsu', desc: 'Kitsu REST catalog metadata' },
  ];

  return (
    <SettingsShell
      title="Account & Trackers"
      subtitle="Configure primary list sync & metadata provider"
    >
      {/* AniList Cloud Sync Card */}
      <div
        style={{ borderRadius: roundness }}
        className="p-5 bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] space-y-4"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#02A9FF]/15 text-[#02A9FF] flex items-center justify-center font-black text-base">
              AL
            </div>
            <div>
              <div className="text-sm font-extrabold">AniList Account Sync</div>
              <p className="text-xs text-[var(--sx-on-surface-muted)]">
                {anilistProfile
                  ? `Connected as @${anilistProfile.username}`
                  : 'Sign in via AniList OAuth2 or paste a Personal Access Token'}
              </p>
            </div>
          </div>
          {state.anilistToken && (
            <button
              type="button"
              data-testid="tracking-anilist-logout-btn"
              onClick={() => void logoutAniList()}
              className="px-3 py-1.5 rounded-xl bg-red-500/12 text-red-400 text-xs font-bold hover:bg-red-500/20"
            >
              Disconnect
            </button>
          )}
        </div>

        {anilistProfile ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-3 rounded-xl bg-[var(--sx-surface-high)]">
              <div className="text-[11px] text-[var(--sx-on-surface-muted)]">Anime</div>
              <div className="text-lg font-black tabular-nums">{anilistProfile.animeCount ?? 0}</div>
            </div>
            <div className="p-3 rounded-xl bg-[var(--sx-surface-high)]">
              <div className="text-[11px] text-[var(--sx-on-surface-muted)]">Episodes</div>
              <div className="text-lg font-black tabular-nums">
                {anilistProfile.episodesWatched ?? 0}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[var(--sx-surface-high)]">
              <div className="text-[11px] text-[var(--sx-on-surface-muted)]">Manga</div>
              <div className="text-lg font-black tabular-nums">{anilistProfile.mangaCount ?? 0}</div>
            </div>
            <div className="p-3 rounded-xl bg-[var(--sx-surface-high)]">
              <div className="text-[11px] text-[var(--sx-on-surface-muted)]">Mean Score</div>
              <div className="text-lg font-black tabular-nums">{anilistProfile.meanScore ?? 0}</div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                data-testid="tracking-anilist-login-btn"
                disabled={oauthBusy}
                onClick={handleOAuthLogin}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#02A9FF] text-white text-xs font-extrabold shadow-sm hover:opacity-92 transition-opacity disabled:opacity-60"
              >
                {oauthBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <LogIn className="w-3.5 h-3.5" />
                )}
                <span>{oauthBusy ? 'Authorizing...' : 'Login with AniList (OAuth2)'}</span>
              </button>
              <a
                href={tokenAuthorizeUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--sx-primary)] hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Open AniList Token Authorization</span>
              </a>
            </div>

            <form onSubmit={handleConnect} className="space-y-2 pt-2 border-t border-[var(--sx-outline)]">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Paste Bearer token or full redirect URL (#access_token=... / ?code=...)"
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-xs font-medium outline-none focus:border-[var(--sx-primary)]"
                />
                <button
                  type="submit"
                  disabled={connecting || !tokenInput.trim()}
                  className="px-4 py-2.5 rounded-xl bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-xs font-bold disabled:opacity-50"
                >
                  {connecting ? 'Verifying...' : 'Save Token'}
                </button>
              </div>
              {error && <p className="text-xs font-semibold text-red-400">{error}</p>}
            </form>
          </div>
        )}
      </div>

      {/* Primary Tracker & Metadata Source */}
      <div
        style={{ borderRadius: roundness }}
        className="bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden"
      >
        <div className="p-4 space-y-3">
          <div className="text-sm font-bold">Primary Library Tracker</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {trackers.map((t) => {
              const active = state.primaryTracker === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPrimaryTracker(t.id)}
                  className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                    active
                      ? 'bg-[var(--sx-primary)]/12 border-[var(--sx-primary)]'
                      : 'bg-[var(--sx-surface-high)]/60 border-[var(--sx-outline)]'
                  }`}
                >
                  <div>
                    <div className="text-xs font-extrabold">{t.label}</div>
                    <div className="text-[11px] text-[var(--sx-on-surface-muted)]">{t.desc}</div>
                  </div>
                  {active && <UserCheck className="w-4 h-4 text-[var(--sx-primary)] shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold">Default Discovery Metadata Provider</div>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">
              Auto uses your primary tracker (fallback to AniList)
            </p>
          </div>
          <select
            value={state.discoveryPrefs.metadataTrackerId ?? 'auto'}
            onChange={(e) =>
              updateDiscoveryPrefs({
                metadataTrackerId:
                  e.target.value === 'auto' ? null : (e.target.value as TrackerType),
              })
            }
            className="px-3 py-2 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-xs font-bold"
          >
            <option value="auto">Auto (Follow Primary)</option>
            <option value="anilist">AniList GraphQL</option>
            <option value="myanimelist">MyAnimeList (Jikan v4)</option>
            <option value="kitsu">Kitsu REST</option>
          </select>
        </div>
      </div>
    </SettingsShell>
  );
};

const RECOMMENDED_EXTENSION_REPOS: Array<{
  id: string;
  label: string;
  name: string;
  manager: ExtensionRepo['manager'];
  url: string;
}> = [
  {
    id: 'yuzono-aniyomi',
    label: 'Yuzono Anime (Aniyomi)',
    name: 'Yuzono Anime Repo',
    manager: 'aniyomi',
    url: 'https://raw.githubusercontent.com/yuzono/anime-repo/repo/index.min.json',
  },
  {
    id: 'kodjodevf-mangayomi',
    label: 'Mangayomi Extensions',
    name: 'Mangayomi Official Extensions',
    manager: 'mangayomi',
    url: 'https://raw.githubusercontent.com/kodjodevf/mangayomi-extensions/main/index.json',
  },
];

export const ExtensionsSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    state,
    allSources,
    toggleSourceActive,
    addExtensionRepo,
    refreshExtensionRepo,
    removeExtensionRepo,
  } = useApp();
  const [repoName, setRepoName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [manager, setManager] = useState<ExtensionRepo['manager']>('aniyomi');
  const [adding, setAdding] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [repoNotice, setRepoNotice] = useState<string | null>(null);
  const [sourceQuery, setSourceQuery] = useState('');
  const [sourceTypeFilter, setSourceTypeFilter] = useState<'ALL' | 'ANIME' | 'MANGA'>('ALL');
  const roundness = `${state.themePrefs.uiRoundness}px`;

  const installRepo = async (
    targetUrl: string,
    targetManager: ExtensionRepo['manager'],
    targetName?: string,
  ) => {
    setAdding(true);
    setRepoError(null);
    setRepoNotice(null);
    try {
      const result = await addExtensionRepo(targetUrl, targetManager, targetName);
      setRepoNotice(
        `Imported ${result.addedCount} extension source${result.addedCount === 1 ? '' : 's'} from "${result.repo.name}".`,
      );
      setRepoName('');
      setRepoUrl('');
    } catch (err) {
      setRepoError(
        err instanceof Error ? err.message : 'Failed to install extension repository.',
      );
    } finally {
      setAdding(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim() || adding) return;
    await installRepo(repoUrl, manager, repoName || undefined);
  };

  const handleRefresh = async (repo: ExtensionRepo) => {
    if (refreshingId) return;
    setRefreshingId(repo.id);
    setRepoError(null);
    setRepoNotice(null);
    try {
      const result = await refreshExtensionRepo(repo.id);
      setRepoNotice(`Refreshed "${repo.name}" (${result.addedCount} sources).`);
    } catch (err) {
      setRepoError(err instanceof Error ? err.message : 'Failed to refresh repository.');
    } finally {
      setRefreshingId(null);
    }
  };

  const filteredSources = allSources.filter((src) => {
    if (
      sourceTypeFilter === 'ANIME' &&
      !src.mediaTypes.some((m) => m === 'ANIME' || m === 'TV' || m === 'MOVIE')
    ) {
      return false;
    }
    if (
      sourceTypeFilter === 'MANGA' &&
      !src.mediaTypes.some((m) => m === 'MANGA' || m === 'NOVEL')
    ) {
      return false;
    }
    const q = sourceQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      src.name.toLowerCase().includes(q) ||
      src.lang.toLowerCase().includes(q) ||
      (src.baseUrl && src.baseUrl.toLowerCase().includes(q)) ||
      (src.description && src.description.toLowerCase().includes(q))
    );
  });

  return (
    <SettingsShell
      title="Extensions & Repositories"
      subtitle="Install real Aniyomi / Mangayomi / CloudStream JSON repos and manage active sources"
      action={
        <button
          type="button"
          onClick={() => navigate('/settings/diagnostics')}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] text-xs font-bold hover:border-[var(--sx-primary)] whitespace-nowrap"
        >
          <Activity className="w-3.5 h-3.5 text-[var(--sx-primary)]" />
          <span>Episode Diagnostics</span>
        </button>
      }
    >
      {/* Extension Repositories */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
          Extension Repositories ({state.repos.length})
        </h2>
        <form
          onSubmit={handleAdd}
          style={{ borderRadius: roundness }}
          className="p-4 bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold">Add Repository Manifest URL</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {RECOMMENDED_EXTENSION_REPOS.map((rec) => {
                const alreadyAdded = state.repos.some((r) => r.url === rec.url);
                return (
                  <button
                    key={rec.id}
                    type="button"
                    data-testid={`recommended-repo-${rec.id}`}
                    disabled={adding}
                    onClick={() => {
                      setRepoName(rec.name);
                      setRepoUrl(rec.url);
                      setManager(rec.manager);
                      void installRepo(rec.url, rec.manager, rec.name);
                    }}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors disabled:opacity-50 ${
                      alreadyAdded
                        ? 'bg-[var(--sx-primary)]/12 border-[var(--sx-primary)]/40 text-[var(--sx-primary)]'
                        : 'bg-[var(--sx-surface-high)] border-[var(--sx-outline)] hover:border-[var(--sx-primary)]'
                    }`}
                  >
                    <Plus className="w-3 h-3" />
                    <span>{rec.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              placeholder="Repo Name (optional)"
              className="px-3 py-2 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-xs outline-none focus:border-[var(--sx-primary)]"
            />
            <select
              value={manager}
              onChange={(e) => setManager(e.target.value as ExtensionRepo['manager'])}
              className="px-3 py-2 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-xs font-bold"
            >
              <option value="aniyomi">Aniyomi</option>
              <option value="mangayomi">Mangayomi</option>
              <option value="cloudstream">CloudStream</option>
              <option value="shonenx">ShizuTv</option>
            </select>
            <button
              type="submit"
              data-testid="extensions-add-repo-btn"
              disabled={adding || !repoUrl.trim()}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-xs font-bold disabled:opacity-55"
            >
              {adding ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              <span>{adding ? 'Fetching Manifest...' : 'Add Repository'}</span>
            </button>
          </div>
          <input
            type="url"
            data-testid="extensions-repo-url-input"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://raw.githubusercontent.com/.../index.min.json"
            className="w-full px-3 py-2 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-xs outline-none focus:border-[var(--sx-primary)]"
          />

          {repoError && (
            <div
              data-testid="extensions-repo-error"
              className="px-3 py-2 rounded-xl bg-red-500/12 border border-red-500/30 text-xs font-semibold text-red-400"
            >
              {repoError}
            </div>
          )}
          {repoNotice && (
            <div
              data-testid="extensions-repo-notice"
              className="px-3 py-2 rounded-xl bg-emerald-500/12 border border-emerald-500/30 text-xs font-semibold text-emerald-400"
            >
              {repoNotice}
            </div>
          )}

          <p className="text-[11px] text-[var(--sx-on-surface-muted)]">
            Supports Aniyomi <code className="font-mono-tabular">index.min.json</code>, Mangayomi{' '}
            <code className="font-mono-tabular">index.json</code>, and CloudStream{' '}
            <code className="font-mono-tabular">repo.json</code> manifests. Installed sources pair
            with AniZip, AniList, and Jikan for real episode lists and browser playback.
          </p>
        </form>

        {state.repos.length > 0 && (
          <div
            style={{ borderRadius: roundness }}
            className="bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden"
          >
            {state.repos.map((repo) => {
              const isRefreshing = refreshingId === repo.id;
              const repoSourceCount = allSources.filter((s) => s.repoUrl === repo.url).length;
              return (
                <div key={repo.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold">{repo.name}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--sx-primary)]/15 text-[var(--sx-primary)] uppercase">
                        {repo.manager}
                      </span>
                      <span className="text-[10px] font-mono-tabular text-[var(--sx-on-surface-muted)]">
                        {repoSourceCount} {repoSourceCount === 1 ? 'source' : 'sources'}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono-tabular text-[var(--sx-on-surface-muted)] truncate mt-0.5">
                      {repo.url}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={isRefreshing}
                      onClick={() => void handleRefresh(repo)}
                      className="p-2 rounded-lg text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-primary)] hover:bg-[var(--sx-surface-high)] disabled:opacity-50"
                      aria-label={`Refresh ${repo.name}`}
                      title="Refresh repository manifest"
                    >
                      <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeExtensionRepo(repo.id)}
                      className="p-2 rounded-lg text-red-400 hover:bg-red-500/12"
                      aria-label={`Remove ${repo.name}`}
                      title="Remove repository"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Active Sources */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
            Installed Sources ({filteredSources.length}
            {filteredSources.length !== allSources.length ? ` of ${allSources.length}` : ''})
          </h2>

          <div className="flex items-center gap-1.5 bg-[var(--sx-surface-container)] p-1 rounded-xl border border-[var(--sx-outline)]">
            {(['ALL', 'ANIME', 'MANGA'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setSourceTypeFilter(tab)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                  sourceTypeFilter === tab
                    ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                    : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                }`}
              >
                {tab === 'ALL' ? 'All' : tab === 'ANIME' ? 'Anime' : 'Manga'}
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[var(--sx-on-surface-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={sourceQuery}
            onChange={(e) => setSourceQuery(e.target.value)}
            placeholder="Filter installed extensions by name, language, or domain..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] text-xs outline-none focus:border-[var(--sx-primary)]"
          />
        </div>

        <div
          data-testid="extensions-installed-list"
          style={{ borderRadius: roundness }}
          className="bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden"
        >
          {filteredSources.length === 0 ? (
            <div className="p-6 text-center text-xs text-[var(--sx-on-surface-muted)]">
              No installed sources match your current filter.
            </div>
          ) : (
            filteredSources.map((src) => {
              const active = state.discoveryPrefs.activeSources.includes(src.id);
              const domainLabel = src.baseUrl
                ? src.baseUrl.replace(/^https?:\/\//, '').split('/')[0]
                : null;
              return (
                <div
                  key={src.id}
                  data-testid={`extension-source-${src.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold truncate">{src.name}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--sx-surface-high)] text-[var(--sx-on-surface-muted)] uppercase">
                        {src.type} · {src.lang}
                      </span>
                      <span className="text-[10px] font-mono-tabular text-[var(--sx-on-surface-muted)]">
                        v{src.version}
                      </span>
                      {src.isNsfw && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-400 uppercase">
                          18+
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--sx-on-surface-muted)] mt-0.5 truncate flex items-center gap-1.5">
                      {domainLabel && <Globe className="w-3 h-3 shrink-0 opacity-75" />}
                      <span className="truncate">
                        {src.description || domainLabel || src.mediaTypes.join(', ')}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid={`toggle-source-${src.id}`}
                    onClick={() => toggleSourceActive(src.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-colors ${
                      active
                        ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                        : 'bg-[var(--sx-surface-high)] text-[var(--sx-on-surface-muted)]'
                    }`}
                  >
                    {active ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>
    </SettingsShell>
  );
};

export const PlayerSettingsPage: React.FC = () => {
  const { state, updatePlayerPrefs } = useApp();
  const { playerPrefs } = state;
  const roundness = `${state.themePrefs.uiRoundness}px`;
  const effectiveQuality = resolveEffectiveStreamQuality(
    playerPrefs.defaultQuality,
    playerPrefs.batterySaver,
  );

  return (
    <SettingsShell
      title="Video Player Settings"
      subtitle="Auto-play, video fit, default quality, Battery Saver, AniSkip & subtitles"
    >
      <div
        style={{ borderRadius: roundness }}
        className="bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden"
      >
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Play className="w-4 h-4 text-[var(--sx-primary)]" />
            <div>
              <div className="text-sm font-bold">Preferred Stream Quality</div>
              <p className="text-xs text-[var(--sx-on-surface-muted)]">
                {playerPrefs.batterySaver
                  ? `Battery Saver active — stream capped at ${effectiveQuality.toUpperCase()}`
                  : 'Initial resolution selected on stream load'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 bg-[var(--sx-surface-high)] p-1 rounded-xl">
            {(['auto', '1080p', '720p', '480p', '360p'] as const).map((q) => {
              const capped = playerPrefs.batterySaver && q !== '480p' && q !== '360p';
              return (
                <button
                  key={q}
                  type="button"
                  disabled={capped}
                  onClick={() => updatePlayerPrefs({ defaultQuality: q })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase disabled:opacity-45 disabled:cursor-not-allowed ${
                    effectiveQuality === q
                      ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                      : 'text-[var(--sx-on-surface-muted)]'
                  }`}
                >
                  {q}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold">Video Fit Mode</div>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">
              Fit shows the full uncropped frame; Zoom crops to fill
            </p>
          </div>
          <div className="flex items-center gap-1.5 bg-[var(--sx-surface-high)] p-1 rounded-xl">
            {(
              [
                { id: 'contain', label: 'Fit (Full)' },
                { id: 'cover', label: 'Zoom' },
                { id: 'fill', label: 'Stretch' },
              ] as const
            ).map((fit) => (
              <button
                key={fit.id}
                type="button"
                onClick={() => updatePlayerPrefs({ videoFit: fit.id })}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  playerPrefs.videoFit === fit.id
                    ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                    : 'text-[var(--sx-on-surface-muted)]'
                }`}
              >
                {fit.label}
              </button>
            ))}
          </div>
        </div>

        <ToggleRow
          testId="settings-toggle-batterysaver"
          label="Battery Saver"
          description="Caps video stream quality to 480p max and disables non-essential UI & player animations"
          checked={playerPrefs.batterySaver}
          onChange={(batterySaver) => updatePlayerPrefs({ batterySaver })}
        />
        <ToggleRow
          label="Auto-Play Video on Open"
          description="Automatically start playback when opening an episode or player"
          checked={playerPrefs.autoPlay}
          onChange={(autoPlay) => updatePlayerPrefs({ autoPlay })}
        />
        <ToggleRow
          label="Auto-Skip Opening (AniSkip)"
          description="Automatically jump past OP segments detected via AniSkip v2"
          checked={playerPrefs.autoSkipOp}
          onChange={(autoSkipOp) => updatePlayerPrefs({ autoSkipOp })}
        />
        <ToggleRow
          label="Auto-Skip Ending (AniSkip)"
          description="Automatically jump past ED credits when timestamps exist"
          checked={playerPrefs.autoSkipEd}
          onChange={(autoSkipEd) => updatePlayerPrefs({ autoSkipEd })}
        />
        <ToggleRow
          label="Auto-Play Next Episode"
          description="Queue the following episode automatically when playback ends"
          checked={playerPrefs.autoNextEpisode}
          onChange={(autoNextEpisode) => updatePlayerPrefs({ autoNextEpisode })}
        />
        <ToggleRow
          label="Auto Picture-in-Picture on Leave"
          description="Automatically enter PiP when leaving the player page while video is playing"
          checked={playerPrefs.autoPip}
          onChange={(autoPip) => updatePlayerPrefs({ autoPip })}
        />
        <ToggleRow
          label="Ambient Glow Effect"
          description="Sample colors from the playing video to illuminate around the inline player"
          checked={playerPrefs.ambientGlow}
          onChange={(ambientGlow) => updatePlayerPrefs({ ambientGlow })}
        />

        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold">Default Playback Speed</div>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">Starting video rate</p>
          </div>
          <div className="flex items-center gap-1.5">
            {[0.75, 1, 1.25, 1.5, 2].map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => updatePlayerPrefs({ defaultSpeed: spd })}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-mono-tabular font-bold ${
                  playerPrefs.defaultSpeed === spd
                    ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                    : 'bg-[var(--sx-surface-high)] text-[var(--sx-on-surface-muted)]'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>

        <ToggleRow
          label="Enable Subtitles"
          description="Display closed captions during anime playback"
          checked={playerPrefs.subtitleEnabled}
          onChange={(subtitleEnabled) => updatePlayerPrefs({ subtitleEnabled })}
        />

        <div className="p-4 space-y-2">
          <div className="flex justify-between text-xs font-bold">
            <span>Subtitle Font Size</span>
            <span className="font-mono-tabular text-[var(--sx-primary)]">
              {playerPrefs.subtitleSize}px
            </span>
          </div>
          <input
            type="range"
            min={12}
            max={30}
            step={1}
            value={playerPrefs.subtitleSize}
            onChange={(e) => updatePlayerPrefs({ subtitleSize: Number(e.target.value) })}
            className="w-full accent-[var(--sx-primary)]"
          />
        </div>

        <ToggleRow
          label="Subtitle Backdrop Box"
          description="Render a dark translucent pill behind caption lines for legibility"
          checked={playerPrefs.subtitleBackground}
          onChange={(subtitleBackground) => updatePlayerPrefs({ subtitleBackground })}
        />
      </div>
    </SettingsShell>
  );
};

export const ReaderSettingsPage: React.FC = () => {
  const { state, updateReaderPrefs } = useApp();
  const { readerPrefs } = state;
  const roundness = `${state.themePrefs.uiRoundness}px`;

  return (
    <SettingsShell
      title="Manga Reader Settings"
      subtitle="Reading orientation, page fit & canvas backdrop"
    >
      <div
        style={{ borderRadius: roundness }}
        className="bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden"
      >
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BookOpen className="w-4 h-4 text-[var(--sx-primary)]" />
            <div>
              <div className="text-sm font-bold">Reading Mode</div>
              <p className="text-xs text-[var(--sx-on-surface-muted)]">
                Continuous Webtoon scroll or paged manga spreads
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-[var(--sx-surface-high)] p-1 rounded-xl">
            {(['webtoon', 'single', 'double'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => updateReaderPrefs({ mode: m })}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${
                  readerPrefs.mode === m
                    ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                    : 'text-[var(--sx-on-surface-muted)]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold">Page Direction</div>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">
              Left-to-Right (Western/Webtoon) or Right-to-Left (Traditional Manga)
            </p>
          </div>
          <div className="flex items-center gap-1.5 bg-[var(--sx-surface-high)] p-1 rounded-xl">
            {(['ltr', 'rtl'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => updateReaderPrefs({ direction: d })}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase ${
                  readerPrefs.direction === d
                    ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                    : 'text-[var(--sx-on-surface-muted)]'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold">Image Scaling</div>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">How pages fit the viewport</p>
          </div>
          <div className="flex items-center gap-1.5 bg-[var(--sx-surface-high)] p-1 rounded-xl">
            {(['width', 'height', 'original'] as const).map((fit) => (
              <button
                key={fit}
                type="button"
                onClick={() => updateReaderPrefs({ fit })}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${
                  readerPrefs.fit === fit
                    ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                    : 'text-[var(--sx-on-surface-muted)]'
                }`}
              >
                {fit}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold">Canvas Backdrop</div>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">
              Background tone behind manga pages
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(
              [
                { id: 'black', label: 'Black', color: '#000000' },
                { id: 'dark', label: 'Dark', color: '#14151a' },
                { id: 'white', label: 'White', color: '#f8fafc' },
                { id: 'sepia', label: 'Sepia', color: '#f4ecd8' },
              ] as const
            ).map((bg) => (
              <button
                key={bg.id}
                type="button"
                onClick={() => updateReaderPrefs({ background: bg.id })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold ${
                  readerPrefs.background === bg.id
                    ? 'border-[var(--sx-primary)] bg-[var(--sx-primary)]/12'
                    : 'border-[var(--sx-outline)] bg-[var(--sx-surface-high)]'
                }`}
              >
                <span
                  className="w-3.5 h-3.5 rounded-full border border-white/25"
                  style={{ backgroundColor: bg.color }}
                />
                <span>{bg.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </SettingsShell>
  );
};

export const ContentSettingsPage: React.FC = () => {
  const { state, updateContentPrefs } = useApp();
  const { contentPrefs } = state;
  const roundness = `${state.themePrefs.uiRoundness}px`;

  return (
    <SettingsShell
      title="Content & Titles"
      subtitle="Preferred title script, content rating filters & language"
    >
      <div
        style={{ borderRadius: roundness }}
        className="bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden"
      >
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold">Title Language Preference</div>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">
              Priority order when displaying anime & manga titles
            </p>
          </div>
          <div className="flex items-center gap-1.5 bg-[var(--sx-surface-high)] p-1 rounded-xl">
            {(['english', 'romaji', 'native'] as TitlePreference[]).map((pref) => (
              <button
                key={pref}
                type="button"
                onClick={() => updateContentPrefs({ titlePreference: pref })}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${
                  contentPrefs.titlePreference === pref
                    ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                    : 'text-[var(--sx-on-surface-muted)]'
                }`}
              >
                {pref}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold">18+ / Adult Content Filter</div>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">
              Controls whether mature entries appear in discovery & search
            </p>
          </div>
          <div className="flex items-center gap-1.5 bg-[var(--sx-surface-high)] p-1 rounded-xl">
            {(
              [
                { id: 'safe', label: 'Safe Only' },
                { id: 'mixed', label: 'Mixed' },
                { id: 'adultOnly', label: '18+ Only' },
              ] as { id: AdultContentMode; label: string }[]
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => updateContentPrefs({ adultContentMode: mode.id })}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  contentPrefs.adultContentMode === mode.id
                    ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                    : 'text-[var(--sx-on-surface-muted)]'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold">Interface Locale</div>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">
              Display localization for ShizuTv labels
            </p>
          </div>
          <select
            value={contentPrefs.language}
            onChange={(e) => updateContentPrefs({ language: e.target.value })}
            className="px-3 py-2 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-xs font-bold"
          >
            <option value="en">English (en)</option>
            <option value="ja">日本語 (ja)</option>
            <option value="es">Español (es)</option>
            <option value="fr">Français (fr)</option>
            <option value="zh-HK">廣東話 (zh-HK)</option>
          </select>
        </div>
      </div>
    </SettingsShell>
  );
};

export const SecuritySettingsPage: React.FC = () => {
  const { state, updateSecurityPrefs, lockApp } = useApp();
  const [pinDraft, setPinDraft] = useState(state.securityPrefs.pinCode || '');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const roundness = `${state.themePrefs.uiRoundness}px`;

  const savePin = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = pinDraft.replace(/\D/g, '').slice(0, 6);
    if (clean.length < 4) {
      setStatusMsg('PIN must be 4 to 6 digits.');
      return;
    }
    updateSecurityPrefs({ pinCode: clean, pinEnabled: true });
    setPinDraft(clean);
    setStatusMsg('PIN saved and lock enabled.');
  };

  return (
    <SettingsShell
      title="Security & App Lock"
      subtitle="Protect your local library and watch history with a numeric PIN"
    >
      <div
        style={{ borderRadius: roundness }}
        className="bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden"
      >
        <ToggleRow
          label="Require PIN on Launch"
          description="Shows the lock keypad whenever ShizuTv opens"
          checked={state.securityPrefs.pinEnabled}
          onChange={(pinEnabled) => {
            if (pinEnabled && state.securityPrefs.pinCode.length < 4) {
              setStatusMsg('Set a 4–6 digit PIN below first.');
              return;
            }
            updateSecurityPrefs({ pinEnabled });
          }}
        />

        <form onSubmit={savePin} className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <ShieldCheck className="w-4 h-4 text-[var(--sx-primary)]" />
            <span>Configure PIN Code</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pinDraft}
              onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter 4–6 digit PIN"
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-sm font-mono-tabular outline-none focus:border-[var(--sx-primary)]"
            />
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-xs font-bold"
            >
              Save PIN
            </button>
            {state.securityPrefs.pinEnabled && state.securityPrefs.pinCode && (
              <button
                type="button"
                onClick={lockApp}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-xs font-bold hover:border-[var(--sx-primary)]"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Lock Now</span>
              </button>
            )}
          </div>
          {statusMsg && (
            <p className="text-xs font-semibold text-[var(--sx-primary)]">{statusMsg}</p>
          )}
        </form>
      </div>
    </SettingsShell>
  );
};

export const BackupSettingsPage: React.FC = () => {
  const { exportBackup, importBackup, resetAllData, state } = useApp();
  const [rawJson, setRawJson] = useState('');
  const [preview, setPreview] = useState<BackupManifest | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const roundness = `${state.themePrefs.uiRoundness}px`;

  const handleDownload = () => {
    const manifest = exportBackup();
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shizutv-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setFeedback({ type: 'ok', text: 'Backup manifest downloaded.' });
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setRawJson(text);
    try {
      const parsed = JSON.parse(text) as BackupManifest;
      if ((parsed.app !== 'ShizuTv' && parsed.app !== 'ShonenX') || !parsed.data) {
        throw new Error('Not a valid ShizuTv backup file');
      }
      setPreview(parsed);
      setFeedback(null);
    } catch (err) {
      setPreview(null);
      setFeedback({ type: 'err', text: String(err) });
    }
  };

  const handleParsePaste = () => {
    try {
      const parsed = JSON.parse(rawJson) as BackupManifest;
      if ((parsed.app !== 'ShizuTv' && parsed.app !== 'ShonenX') || !parsed.data) {
        throw new Error('Not a valid ShizuTv backup manifest');
      }
      setPreview(parsed);
      setFeedback(null);
    } catch (err) {
      setPreview(null);
      setFeedback({ type: 'err', text: String(err) });
    }
  };

  const applyImport = () => {
    if (!preview) return;
    try {
      importBackup(preview);
      setPreview(null);
      setRawJson('');
      setFeedback({ type: 'ok', text: 'Backup restored successfully!' });
    } catch (err) {
      setFeedback({ type: 'err', text: String(err) });
    }
  };

  return (
    <SettingsShell
      title="Backup & Restore"
      subtitle="Export or restore your library, history, theme & repository preferences"
    >
      <div
        style={{ borderRadius: roundness }}
        className="p-5 bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-extrabold">Export ShizuTv Manifest</div>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">
              Includes {state.library.length} library entries, {state.history.length} history items,{' '}
              {state.repos.length} repos & theme settings
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-xs font-bold"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(JSON.stringify(exportBackup(), null, 2));
                setFeedback({ type: 'ok', text: 'Copied JSON manifest to clipboard.' });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-xs font-bold"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </button>
          </div>
        </div>
      </div>

      <div
        style={{ borderRadius: roundness }}
        className="p-5 bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-extrabold">Restore from JSON</div>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">
              Upload a .json backup or paste manifest contents to preview before applying
            </p>
          </div>
          <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-xs font-bold cursor-pointer hover:border-[var(--sx-primary)]">
            <Upload className="w-3.5 h-3.5" />
            <span>Choose File</span>
            <input type="file" accept="application/json" onChange={handleFile} className="hidden" />
          </label>
        </div>

        <textarea
          rows={4}
          value={rawJson}
          onChange={(e) => setRawJson(e.target.value)}
          placeholder='{"app": "ShizuTv", "version": "2.1.5", ...}'
          className="w-full p-3 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-xs font-mono-tabular outline-none focus:border-[var(--sx-primary)]"
        />

        {rawJson && !preview && (
          <button
            type="button"
            onClick={handleParsePaste}
            className="px-4 py-2 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-xs font-bold"
          >
            Inspect Manifest
          </button>
        )}

        {preview && (
          <div className="p-4 rounded-xl bg-[var(--sx-primary)]/10 border border-[var(--sx-primary)]/30 space-y-3">
            <div className="text-xs font-extrabold text-[var(--sx-primary)]">
              Backup Preview · Exported {new Date(preview.exportedAt).toLocaleString()}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>Library: {preview.data.library?.length ?? 0}</div>
              <div>History: {preview.data.history?.length ?? 0}</div>
              <div>Repos: {preview.data.repos?.length ?? 0}</div>
            </div>
            <button
              type="button"
              onClick={applyImport}
              className="px-4 py-2 rounded-xl bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-xs font-bold"
            >
              Restore Now
            </button>
          </div>
        )}

        {feedback && (
          <p
            className={`text-xs font-semibold ${
              feedback.type === 'ok' ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {feedback.text}
          </p>
        )}
      </div>

      {/* Danger Zone */}
      <div
        style={{ borderRadius: roundness }}
        className="p-5 bg-red-500/8 border border-red-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-extrabold text-red-300">Reset All Local Data</div>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">
              Clears library, watch/read history, downloads, and resets preferences to defaults
            </p>
          </div>
        </div>
        {confirmReset ? (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                resetAllData();
                setConfirmReset(false);
                setFeedback({ type: 'ok', text: 'All local data reset to factory defaults.' });
              }}
              className="px-3.5 py-2 rounded-xl bg-red-500 text-white text-xs font-bold"
            >
              Confirm Reset
            </button>
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="px-3 py-2 rounded-xl bg-[var(--sx-surface-high)] text-xs font-bold"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="px-4 py-2 rounded-xl bg-red-500/15 text-red-300 border border-red-500/30 text-xs font-bold shrink-0"
          >
            Reset Data
          </button>
        )}
      </div>
    </SettingsShell>
  );
};

export const DiscordSettingsPage: React.FC = () => {
  const { state, updateDiscordPrefs } = useApp();
  const { discordPrefs } = state;
  const roundness = `${state.themePrefs.uiRoundness}px`;

  return (
    <SettingsShell
      title="Discord Rich Presence"
      subtitle="Configure activity metadata shown on your Discord profile (web preview)"
    >
      <div
        style={{ borderRadius: roundness }}
        className="bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden"
      >
        <ToggleRow
          label="Enable Rich Presence Activity"
          description="Track active episode or chapter status for Discord RPC"
          checked={discordPrefs.enabled}
          onChange={(enabled) => updateDiscordPrefs({ enabled })}
        />
        <ToggleRow
          label="Show Media Title"
          description="Display the anime or manga title in activity details"
          checked={discordPrefs.showMediaTitle}
          onChange={(showMediaTitle) => updateDiscordPrefs({ showMediaTitle })}
        />
        <ToggleRow
          label="Show Episode / Chapter Progress"
          description="Include current episode or chapter counter"
          checked={discordPrefs.showEpisodeProgress}
          onChange={(showEpisodeProgress) => updateDiscordPrefs({ showEpisodeProgress })}
        />
        <div className="p-4 space-y-2">
          <label className="text-xs font-bold block">Custom Idle Status</label>
          <input
            type="text"
            value={discordPrefs.customState}
            onChange={(e) => updateDiscordPrefs({ customState: e.target.value })}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-xs font-medium outline-none focus:border-[var(--sx-primary)]"
          />
        </div>
      </div>

      {/* Live Discord Activity Card Preview */}
      <div
        style={{ borderRadius: roundness }}
        className="p-4 bg-[#111214] text-white border border-white/10 max-w-md space-y-3"
      >
        <div className="text-[10px] font-bold uppercase tracking-widest text-white/50">
          Activity Preview
        </div>
        <div className="flex items-center gap-3.5">
          <div className="w-14 h-14 rounded-xl bg-[var(--sx-primary)]/20 border border-[var(--sx-primary)]/40 flex items-center justify-center shrink-0">
            <ShonenXLogo size={28} className="text-[var(--sx-primary)]" />
          </div>
          <div className="min-w-0 text-xs space-y-0.5">
            <div className="font-extrabold">ShizuTv</div>
            <div className="text-white/80 truncate">
              {discordPrefs.enabled
                ? discordPrefs.showMediaTitle
                  ? 'One Piece'
                  : discordPrefs.customState
                : 'Rich Presence Disabled'}
            </div>
            {discordPrefs.enabled && discordPrefs.showEpisodeProgress && (
              <div className="text-white/60">Episode 1071 · 18:24 elapsed</div>
            )}
          </div>
        </div>
      </div>
    </SettingsShell>
  );
};

export const LogsSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { logs, clearLogs, state } = useApp();
  const [filter, setFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR'>('ALL');
  const roundness = `${state.themePrefs.uiRoundness}px`;

  const visible = filter === 'ALL' ? logs : logs.filter((l) => l.level === filter);

  return (
    <SettingsShell
      title="System Logs"
      subtitle="Runtime telemetry for trackers, streams & local persistence"
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/settings/diagnostics')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] text-xs font-bold hover:border-[var(--sx-primary)] whitespace-nowrap"
          >
            <Activity className="w-3.5 h-3.5 text-[var(--sx-primary)]" />
            <span>Episode Diagnostics</span>
          </button>
          <button
            type="button"
            onClick={clearLogs}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] text-xs font-bold hover:border-[var(--sx-primary)]"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>
      }
    >
      <div className="flex items-center gap-2">
        {(['ALL', 'INFO', 'WARN', 'ERROR'] as const).map((lvl) => (
          <button
            key={lvl}
            type="button"
            onClick={() => setFilter(lvl)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
              filter === lvl
                ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                : 'bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] text-[var(--sx-on-surface-muted)]'
            }`}
          >
            {lvl}
          </button>
        ))}
      </div>

      <div
        style={{ borderRadius: roundness }}
        className="bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden font-mono-tabular"
      >
        {visible.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--sx-on-surface-muted)] flex flex-col items-center gap-2">
            <Terminal className="w-5 h-5" />
            <span>No log entries for this filter.</span>
          </div>
        ) : (
          visible.map((entry) => (
            <div key={entry.id} className="px-4 py-2.5 text-xs flex items-start gap-3">
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                  entry.level === 'ERROR'
                    ? 'bg-red-500/20 text-red-400'
                    : entry.level === 'WARN'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-[var(--sx-primary)]/15 text-[var(--sx-primary)]'
                }`}
              >
                {entry.level}
              </span>
              <div className="min-w-0 flex-1">
                <span className="font-bold text-[var(--sx-on-surface)]">[{entry.scope}]</span>{' '}
                <span className="text-[var(--sx-on-surface-muted)]">{entry.message}</span>
              </div>
              <span className="text-[10px] text-[var(--sx-on-surface-muted)] shrink-0">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))
        )}
      </div>
    </SettingsShell>
  );
};

export const AboutSettingsPage: React.FC = () => {
  const { state, addLog } = useApp();
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);
  const roundness = `${state.themePrefs.uiRoundness}px`;

  const handleClearCache = async () => {
    try {
      sessionStorage.clear();
    } catch {
      // Ignore
    }
    await clearOfflineCaches();
    addLog('INFO', 'Cache', 'Cleared session, image, and offline recent content caches');
    setCacheNotice('Session & offline caches cleared.');
  };

  return (
    <SettingsShell title="About ShizuTv" subtitle="Watch. Read. Track.">
      <div
        style={{ borderRadius: roundness }}
        className="p-6 bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] flex flex-col sm:flex-row items-center gap-5"
      >
        <div className="w-16 h-16 rounded-2xl bg-[var(--sx-primary)]/15 border border-[var(--sx-primary)]/30 flex items-center justify-center shrink-0">
          <ShonenXLogo size={36} className="text-[var(--sx-primary)]" />
        </div>
        <div className="text-center sm:text-left space-y-1 flex-1">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h2 className="text-xl font-black tracking-tight">ShizuTv v2.1.5</h2>
            <PWAInstallButton compact />
          </div>
          <p className="text-xs text-[var(--sx-on-surface-muted)]">
            Ad-free anime & manga streaming, reading, and tracking client · GPL-3.0 License.
          </p>
          <div className="pt-2 flex flex-wrap justify-center sm:justify-start gap-2">
            {['React 19', 'TypeScript', 'AniList GraphQL', 'Jikan v4', 'Kitsu REST', 'hls.js'].map(
              (tech) => (
                <span
                  key={tech}
                  className="px-2.5 py-1 rounded-lg bg-[var(--sx-surface-high)] text-[11px] font-bold"
                >
                  {tech}
                </span>
              ),
            )}
          </div>
        </div>
      </div>

      <div
        style={{ borderRadius: roundness }}
        className="p-5 bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div>
          <div className="text-sm font-bold">Offline &amp; Image Cache</div>
          <p className="text-xs text-[var(--sx-on-surface-muted)]">
            Clear cached images, recent feeds, and temporary session metadata without affecting your
            library or preferences
          </p>
          {cacheNotice && (
            <p className="text-xs font-semibold text-emerald-400 mt-1">{cacheNotice}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void handleClearCache()}
          className="px-4 py-2 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-xs font-bold hover:border-[var(--sx-primary)] shrink-0"
        >
          Clear Cache
        </button>
      </div>

      <div
        style={{ borderRadius: roundness }}
        className="p-5 bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] text-xs text-[var(--sx-on-surface-muted)] leading-relaxed"
      >
        <strong className="text-[var(--sx-on-surface)]">Disclaimer:</strong> ShizuTv does not host,
        upload, or distribute copyrighted media files. Catalog metadata is retrieved directly from
        AniList, MyAnimeList (Jikan), Kitsu, and AniSkip public APIs.
      </div>
    </SettingsShell>
  );
};
