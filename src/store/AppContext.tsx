import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AdultContentMode,
  CommentEntry,
  DownloadTask,
  ExtensionRepo,
  HistoryEntry,
  HomeSection,
  LibraryEntry,
  LogEntry,
  MediaType,
  SourceInfo,
  TitlePreference,
  TrackedStatus,
  TrackerProfile,
  TrackerType,
  UnifiedMedia,
} from '../types/media';
import {
  createDefaultCardStylePrefs,
  selectMediaCardStyle,
} from '../utils/mediaCard';
import {
  DEFAULT_EPISODE_CHAPTER_STYLE,
  resolveEpisodeChapterStyle,
} from '../utils/episodeChapterStyle';
import {
  AppThemePreset,
  BackgroundGradientStyle,
  BUILT_IN_PRESETS,
  EpisodeChapterStyle,
  EXCLUSIVE_SCHEMES,
  HeroBannerStyle,
  HomeHeaderStyle,
  MediaCardStyle,
  NavBarStyle,
  ThemeMode,
} from '../data/themePresets';
import { INBUILT_SOURCES } from '../services/sourceEngine';
import { fetchAniListViewer, saveAniListMediaEntry } from '../services/anilist';

export interface ThemePrefs {
  themeMode: ThemeMode;
  exclusiveScheme: string;
  activePresetId: string | null;
  useAmoled: boolean;
  uiRoundness: number;
  uiScale: number;
  useGradients: boolean;
  gradientStyle: BackgroundGradientStyle;
  gradientIntensity: number;
  useNoiseOverlay: boolean;
  noiseOpacity: number;
}

export interface UiPrefs {
  cardStyle: MediaCardStyle;
  continueWatchingStyle: MediaCardStyle;
  continueReadingStyle: MediaCardStyle;
  wideCardMode: boolean;
  navBarStyle: NavBarStyle;
  homeHeaderStyle: HomeHeaderStyle;
  heroBannerStyle: HeroBannerStyle;
  episodeChapterStyle: EpisodeChapterStyle;
  useNewUi: boolean; // TV / Big-Screen Mode
}

export interface ContentPrefs {
  titlePreference: TitlePreference;
  adultContentMode: AdultContentMode;
  language: string;
  incognitoMode?: boolean;
}

export interface DiscoveryPrefs {
  mode: 'tracker' | 'source';
  metadataTrackerId: TrackerType | null; // null = Auto
  activeSources: string[];
}

export interface PlayerPrefs {
  defaultQuality: '1080p' | '720p' | 'auto';
  autoSkipOp: boolean;
  autoSkipEd: boolean;
  autoNextEpisode: boolean;
  defaultSpeed: number;
  subtitleSize: number;
  subtitleBackground: boolean;
}

export interface ReaderPrefs {
  mode: 'webtoon' | 'single' | 'double';
  direction: 'ltr' | 'rtl';
  fit: 'width' | 'height' | 'original';
  background: 'black' | 'dark' | 'white' | 'sepia';
}

export interface DiscordRpcPrefs {
  enabled: boolean;
  showMediaTitle: boolean;
  showEpisodeProgress: boolean;
  customState: string;
}

export interface SecurityPrefs {
  pinEnabled: boolean;
  pinCode: string;
}

export const DEFAULT_HOME_SECTIONS: HomeSection[] = [
  {
    id: 'continue-watching',
    title: 'Continue Watching',
    type: 'continueMedia',
    disabled: false,
    targetMediaType: 'ANIME',
  },
  {
    id: 'trending-anime',
    title: 'Trending Anime',
    type: 'discovery',
    disabled: false,
    targetMediaType: 'ANIME',
    trackerCategory: 'trending',
  },
  {
    id: 'popular-anime',
    title: 'Popular Anime',
    type: 'discovery',
    disabled: false,
    targetMediaType: 'ANIME',
    trackerCategory: 'popular',
  },
  {
    id: 'top-rated-anime',
    title: 'Top Rated Anime',
    type: 'discovery',
    disabled: false,
    targetMediaType: 'ANIME',
    trackerCategory: 'topRated',
  },
  {
    id: 'continue-reading',
    title: 'Continue Reading',
    type: 'continueMedia',
    disabled: false,
    targetMediaType: 'MANGA',
  },
  {
    id: 'trending-manga',
    title: 'Trending Manga',
    type: 'discovery',
    disabled: false,
    targetMediaType: 'MANGA',
    trackerCategory: 'trending',
  },
  {
    id: 'popular-manga',
    title: 'Popular Manga',
    type: 'discovery',
    disabled: false,
    targetMediaType: 'MANGA',
    trackerCategory: 'popular',
  },
  {
    id: 'top-rated-manga',
    title: 'Top Rated Manga',
    type: 'discovery',
    disabled: false,
    targetMediaType: 'MANGA',
    trackerCategory: 'topRated',
  },
];

const STORAGE_KEY = 'shizutv_state_v2';
const LEGACY_STORAGE_KEY = 'shonenx_state_v2';

interface PersistedState {
  themePrefs: ThemePrefs;
  uiPrefs: UiPrefs;
  contentPrefs: ContentPrefs;
  discoveryPrefs: DiscoveryPrefs;
  homeSections: HomeSection[];
  playerPrefs: PlayerPrefs;
  readerPrefs: ReaderPrefs;
  discordPrefs: DiscordRpcPrefs;
  securityPrefs: SecurityPrefs;
  primaryTracker: TrackerType;
  anilistToken: string | null;
  profiles: Partial<Record<TrackerType, TrackerProfile>>;
  library: LibraryEntry[];
  history: HistoryEntry[];
  downloads: DownloadTask[];
  repos: ExtensionRepo[];
  customSources: SourceInfo[];
  comments: Record<string, CommentEntry[]>;
  onboardingDone: boolean;
}

const DEFAULT_STATE: PersistedState = {
  themePrefs: {
    themeMode: 'dark',
    exclusiveScheme: 'shizutv',
    activePresetId: null,
    useAmoled: false,
    uiRoundness: 16,
    uiScale: 1,
    useGradients: true,
    gradientStyle: 'radial',
    gradientIntensity: 0.55,
    useNoiseOverlay: false,
    noiseOpacity: 0.05,
  },
  uiPrefs: {
    ...createDefaultCardStylePrefs(),
    wideCardMode: false,
    navBarStyle: 'frosted',
    homeHeaderStyle: 'prominent',
    heroBannerStyle: 'classic',
    episodeChapterStyle: DEFAULT_EPISODE_CHAPTER_STYLE,
    useNewUi: false,
  },
  contentPrefs: {
    titlePreference: 'english',
    adultContentMode: 'safe',
    language: 'en',
    incognitoMode: false,
  },
  discoveryPrefs: {
    mode: 'tracker',
    metadataTrackerId: null,
    activeSources: INBUILT_SOURCES.map((s) => s.id),
  },
  homeSections: DEFAULT_HOME_SECTIONS,
  playerPrefs: {
    defaultQuality: '1080p',
    autoSkipOp: false,
    autoSkipEd: false,
    autoNextEpisode: true,
    defaultSpeed: 1.0,
    subtitleSize: 18,
    subtitleBackground: true,
  },
  readerPrefs: {
    mode: 'webtoon',
    direction: 'ltr',
    fit: 'width',
    background: 'dark',
  },
  discordPrefs: {
    enabled: false,
    showMediaTitle: true,
    showEpisodeProgress: true,
    customState: 'Watching on ShizuTv',
  },
  securityPrefs: {
    pinEnabled: false,
    pinCode: '',
  },
  primaryTracker: 'local',
  anilistToken: null,
  profiles: {
    local: {
      tracker: 'local',
      username: 'Guest',
      bio: 'Local ShizuTv offline tracker profile',
    },
  },
  library: [],
  history: [],
  downloads: [],
  repos: [
    {
      id: 'repo-shizutv-official',
      name: 'ShizuTv Inbuilt Core',
      url: 'https://raw.githubusercontent.com/roshancodespace/ShonenX/main/scripts/source.dart',
      manager: 'shonenx',
      addedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  customSources: [],
  comments: {},
  onboardingDone: true,
};

function loadInitialState(): PersistedState {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_STATE,
      ...parsed,
      themePrefs: { ...DEFAULT_STATE.themePrefs, ...(parsed.themePrefs || {}) },
      uiPrefs: {
        ...DEFAULT_STATE.uiPrefs,
        ...(parsed.uiPrefs || {}),
        episodeChapterStyle: resolveEpisodeChapterStyle(parsed.uiPrefs?.episodeChapterStyle),
      },
      contentPrefs: { ...DEFAULT_STATE.contentPrefs, ...(parsed.contentPrefs || {}) },
      discoveryPrefs: { ...DEFAULT_STATE.discoveryPrefs, ...(parsed.discoveryPrefs || {}) },
      playerPrefs: { ...DEFAULT_STATE.playerPrefs, ...(parsed.playerPrefs || {}) },
      readerPrefs: { ...DEFAULT_STATE.readerPrefs, ...(parsed.readerPrefs || {}) },
      discordPrefs: { ...DEFAULT_STATE.discordPrefs, ...(parsed.discordPrefs || {}) },
      securityPrefs: { ...DEFAULT_STATE.securityPrefs, ...(parsed.securityPrefs || {}) },
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export interface BackupManifest {
  app: 'ShizuTv' | 'ShonenX';
  version: string;
  exportedAt: string;
  data: Partial<PersistedState>;
}

interface AppContextValue {
  state: PersistedState;
  isLocked: boolean;
  unlockApp: (pin: string) => boolean;
  lockApp: () => void;
  logs: LogEntry[];
  addLog: (level: LogEntry['level'], scope: string, message: string) => void;
  clearLogs: () => void;

  // Theme & UI
  updateThemePrefs: (patch: Partial<ThemePrefs>) => void;
  applyPreset: (preset: AppThemePreset) => void;
  updateUiPrefs: (patch: Partial<UiPrefs>) => void;
  updateContentPrefs: (patch: Partial<ContentPrefs>) => void;
  updateDiscoveryPrefs: (patch: Partial<DiscoveryPrefs>) => void;
  setHomeSections: (sections: HomeSection[]) => void;
  updatePlayerPrefs: (patch: Partial<PlayerPrefs>) => void;
  updateReaderPrefs: (patch: Partial<ReaderPrefs>) => void;
  updateDiscordPrefs: (patch: Partial<DiscordRpcPrefs>) => void;
  updateSecurityPrefs: (patch: Partial<SecurityPrefs>) => void;

  // Trackers & Library
  setPrimaryTracker: (tracker: TrackerType) => void;
  connectAniListToken: (token: string) => Promise<TrackerProfile>;
  disconnectTracker: (tracker: TrackerType) => void;
  upsertLibraryEntry: (
    media: UnifiedMedia,
    status: TrackedStatus,
    progress: number,
    score?: number,
    notes?: string,
  ) => Promise<void>;
  removeLibraryEntry: (mediaId: string) => void;
  getLibraryEntry: (mediaId: string) => LibraryEntry | undefined;

  // History
  recordHistory: (entry: Omit<HistoryEntry, 'id' | 'updatedAt'>) => void;
  removeHistoryItem: (id: string) => void;
  clearHistoryForMedia: (mediaId: string) => void;

  // Downloads
  enqueueDownload: (
    media: UnifiedMedia,
    itemNumber: number,
    itemTitle: string,
    quality?: string,
  ) => void;
  toggleDownloadPause: (id: string) => void;
  removeDownload: (id: string) => void;
  clearCompletedDownloads: () => void;

  // Extensions & Sources
  allSources: SourceInfo[];
  toggleSourceActive: (sourceId: string) => void;
  addExtensionRepo: (url: string, manager: ExtensionRepo['manager'], name?: string) => void;
  removeExtensionRepo: (id: string) => void;

  // Comments
  addComment: (mediaId: string, body: string, spoiler?: boolean) => void;
  likeComment: (mediaId: string, commentId: string) => void;

  // Backup
  exportBackup: () => BackupManifest;
  importBackup: (manifest: BackupManifest) => void;
  resetAllData: () => void;

  // Effective resolved metadata tracker
  effectiveMetadataTracker: Exclude<TrackerType, 'local'>;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<PersistedState>(loadInitialState);
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    const init = loadInitialState();
    return Boolean(init.securityPrefs.pinEnabled && init.securityPrefs.pinCode);
  });
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'boot-1',
      level: 'INFO',
      scope: 'AppInit',
      message: 'ShizuTv Web Engine initialized (v2.1.5)',
      timestamp: new Date().toISOString(),
    },
  ]);

  const addLog = useCallback((level: LogEntry['level'], scope: string, message: string) => {
    setLogs((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        level,
        scope,
        message,
        timestamp: new Date().toISOString(),
      },
      ...prev.slice(0, 199),
    ]);
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors
    }
  }, [state]);

  // Apply active theme scheme & dark/AMOLED CSS variables to document root
  useEffect(() => {
    const { themePrefs } = state;
    const root = document.documentElement;
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark =
      themePrefs.themeMode === 'dark' ||
      (themePrefs.themeMode === 'system' && prefersDark);

    root.classList.toggle('dark', isDark);
    root.classList.toggle('amoled', isDark && themePrefs.useAmoled);

    const scheme =
      EXCLUSIVE_SCHEMES.find((s) => s.id === themePrefs.exclusiveScheme) ??
      EXCLUSIVE_SCHEMES[0];
    const palette = isDark ? scheme.dark : scheme.light;

    root.style.setProperty('--sx-primary', palette.primary);
    root.style.setProperty('--sx-primary-container', palette.primaryContainer);
    root.style.setProperty('--sx-secondary', palette.secondary);
    root.style.setProperty('--sx-tertiary', palette.tertiary);
    root.style.setProperty('--sx-radius', `${themePrefs.uiRoundness}px`);

    // Contrast-aware on-primary
    const hex = palette.primary.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) || 0;
    const g = parseInt(hex.substring(2, 4), 16) || 0;
    const b = parseInt(hex.substring(4, 6), 16) || 0;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    root.style.setProperty('--sx-on-primary', luminance > 0.62 ? '#0b0c10' : '#ffffff');
    root.style.setProperty('--sx-on-primary-container', isDark ? '#f8fafc' : '#111827');
  }, [state.themePrefs]);

  // Simulated background download worker for queued download tasks
  useEffect(() => {
    const hasActive = state.downloads.some(
      (d) => d.status === 'downloading' || d.status === 'pending',
    );
    if (!hasActive) return;

    const timer = setInterval(() => {
      setState((prev) => {
        let changed = false;
        const nextDownloads = prev.downloads.map((task) => {
          if (task.status === 'pending') {
            changed = true;
            return { ...task, status: 'downloading' as const };
          }
          if (task.status === 'downloading') {
            changed = true;
            const nextProgress = Math.min(1, task.progress + 0.12);
            const nextBytes = Math.round(task.totalBytes * nextProgress);
            return {
              ...task,
              progress: nextProgress,
              downloadedBytes: nextBytes,
              status: nextProgress >= 1 ? ('completed' as const) : ('downloading' as const),
            };
          }
          return task;
        });
        return changed ? { ...prev, downloads: nextDownloads } : prev;
      });
    }, 800);

    return () => clearInterval(timer);
  }, [state.downloads]);

  const updateThemePrefs = useCallback((patch: Partial<ThemePrefs>) => {
    setState((prev) => ({
      ...prev,
      themePrefs: { ...prev.themePrefs, ...patch, activePresetId: patch.activePresetId ?? null },
    }));
  }, []);

  const applyPreset = useCallback(
    (preset: AppThemePreset) => {
      setState((prev) => ({
        ...prev,
        themePrefs: {
          ...prev.themePrefs,
          themeMode: preset.themeMode,
          exclusiveScheme: preset.exclusiveScheme,
          activePresetId: preset.id,
          useAmoled: preset.useAmoled,
          useGradients: preset.useGradients,
          gradientStyle: preset.gradientStyle,
          gradientIntensity: preset.gradientIntensity,
          useNoiseOverlay: preset.useNoiseOverlay,
          noiseOpacity: preset.noiseOpacity,
          uiRoundness: preset.uiRoundness,
        },
        uiPrefs: {
          ...selectMediaCardStyle(prev.uiPrefs, preset.cardStyle),
          navBarStyle: preset.navBarStyle,
          homeHeaderStyle: preset.homeHeaderStyle,
        },
      }));
      addLog('INFO', 'Theme', `Applied preset "${preset.name}"`);
    },
    [addLog],
  );

  const updateUiPrefs = useCallback((patch: Partial<UiPrefs>) => {
    setState((prev) => ({ ...prev, uiPrefs: { ...prev.uiPrefs, ...patch } }));
  }, []);

  const updateContentPrefs = useCallback((patch: Partial<ContentPrefs>) => {
    setState((prev) => ({ ...prev, contentPrefs: { ...prev.contentPrefs, ...patch } }));
  }, []);

  const updateDiscoveryPrefs = useCallback((patch: Partial<DiscoveryPrefs>) => {
    setState((prev) => ({ ...prev, discoveryPrefs: { ...prev.discoveryPrefs, ...patch } }));
  }, []);

  const setHomeSections = useCallback((homeSections: HomeSection[]) => {
    setState((prev) => ({ ...prev, homeSections }));
  }, []);

  const updatePlayerPrefs = useCallback((patch: Partial<PlayerPrefs>) => {
    setState((prev) => ({ ...prev, playerPrefs: { ...prev.playerPrefs, ...patch } }));
  }, []);

  const updateReaderPrefs = useCallback((patch: Partial<ReaderPrefs>) => {
    setState((prev) => ({ ...prev, readerPrefs: { ...prev.readerPrefs, ...patch } }));
  }, []);

  const updateDiscordPrefs = useCallback((patch: Partial<DiscordRpcPrefs>) => {
    setState((prev) => ({ ...prev, discordPrefs: { ...prev.discordPrefs, ...patch } }));
  }, []);

  const updateSecurityPrefs = useCallback((patch: Partial<SecurityPrefs>) => {
    setState((prev) => ({ ...prev, securityPrefs: { ...prev.securityPrefs, ...patch } }));
  }, []);

  const unlockApp = useCallback(
    (pin: string) => {
      if (pin === state.securityPrefs.pinCode) {
        setIsLocked(false);
        return true;
      }
      return false;
    },
    [state.securityPrefs.pinCode],
  );

  const lockApp = useCallback(() => {
    if (state.securityPrefs.pinEnabled && state.securityPrefs.pinCode) {
      setIsLocked(true);
    }
  }, [state.securityPrefs]);

  const setPrimaryTracker = useCallback(
    (primaryTracker: TrackerType) => {
      setState((prev) => ({ ...prev, primaryTracker }));
      addLog('INFO', 'Tracking', `Primary tracker set to ${primaryTracker}`);
    },
    [addLog],
  );

  const connectAniListToken = useCallback(
    async (token: string) => {
      const profile = await fetchAniListViewer(token.trim());
      setState((prev) => ({
        ...prev,
        anilistToken: token.trim(),
        primaryTracker: 'anilist',
        profiles: { ...prev.profiles, anilist: profile },
      }));
      addLog('INFO', 'AniList', `Connected AniList account @${profile.username}`);
      return profile;
    },
    [addLog],
  );

  const disconnectTracker = useCallback(
    (tracker: TrackerType) => {
      setState((prev) => {
        const nextProfiles = { ...prev.profiles };
        delete nextProfiles[tracker];
        return {
          ...prev,
          anilistToken: tracker === 'anilist' ? null : prev.anilistToken,
          primaryTracker: prev.primaryTracker === tracker ? 'local' : prev.primaryTracker,
          profiles: nextProfiles,
        };
      });
      addLog('INFO', 'Tracking', `Disconnected ${tracker}`);
    },
    [addLog],
  );

  const upsertLibraryEntry = useCallback(
    async (
      media: UnifiedMedia,
      status: TrackedStatus,
      progress: number,
      score = 0,
      notes = '',
    ) => {
      const entry: LibraryEntry = {
        mediaId: media.id,
        mediaType: media.type,
        media,
        status,
        progress,
        score,
        notes,
        updatedAt: new Date().toISOString(),
        trackerType: state.primaryTracker,
      };

      setState((prev) => {
        const filtered = prev.library.filter((l) => l.mediaId !== media.id);
        return { ...prev, library: [entry, ...filtered] };
      });

      if (state.primaryTracker === 'anilist' && state.anilistToken) {
        try {
          await saveAniListMediaEntry(state.anilistToken, media.id, status, progress, score);
          addLog('INFO', 'AniListSync', `Synced ${media.title.english || media.id} -> ${status}`);
        } catch (e) {
          addLog('WARN', 'AniListSync', `Saved locally; cloud sync error: ${String(e)}`);
        }
      }
    },
    [state.primaryTracker, state.anilistToken, addLog],
  );

  const removeLibraryEntry = useCallback((mediaId: string) => {
    setState((prev) => ({
      ...prev,
      library: prev.library.filter((l) => l.mediaId !== mediaId),
    }));
  }, []);

  const getLibraryEntry = useCallback(
    (mediaId: string) => state.library.find((l) => l.mediaId === mediaId),
    [state.library],
  );

  const recordHistory = useCallback((entry: Omit<HistoryEntry, 'id' | 'updatedAt'>) => {
    const id = `${entry.mediaId}-${entry.mediaType}-${entry.episodeNumber ?? entry.chapterNumber ?? 0}`;
    const fullEntry: HistoryEntry = {
      ...entry,
      id,
      updatedAt: new Date().toISOString(),
    };
    setState((prev) => {
      if (prev.contentPrefs.incognitoMode) {
        return prev;
      }
      const withoutSameMedia = prev.history.filter(
        (h) => !(h.mediaId === entry.mediaId && h.mediaType === entry.mediaType),
      );
      return {
        ...prev,
        history: [fullEntry, ...withoutSameMedia].slice(0, 100),
      };
    });
  }, []);

  const removeHistoryItem = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      history: prev.history.filter((h) => h.id !== id),
    }));
  }, []);

  const clearHistoryForMedia = useCallback((mediaId: string) => {
    setState((prev) => ({
      ...prev,
      history: prev.history.filter((h) => h.mediaId !== mediaId),
    }));
  }, []);

  const enqueueDownload = useCallback(
    (media: UnifiedMedia, itemNumber: number, itemTitle: string, quality = '1080p') => {
      const id = `dl-${media.id}-${itemNumber}`;
      const title = media.title.english || media.title.romaji || 'Media';
      const totalBytes = media.type === 'MANGA' ? 18 * 1024 * 1024 : 265 * 1024 * 1024;
      setState((prev) => {
        if (prev.downloads.some((d) => d.id === id)) return prev;
        const task: DownloadTask = {
          id,
          mediaId: media.id,
          mediaTitle: title,
          mediaType: media.type,
          cover: media.cover,
          itemNumber,
          itemTitle,
          quality,
          progress: 0.05,
          totalBytes,
          downloadedBytes: Math.round(totalBytes * 0.05),
          status: 'pending',
          createdAt: new Date().toISOString(),
        };
        return { ...prev, downloads: [task, ...prev.downloads] };
      });
      addLog('INFO', 'Downloads', `Queued ${title} #${itemNumber}`);
    },
    [addLog],
  );

  const toggleDownloadPause = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      downloads: prev.downloads.map((d) => {
        if (d.id !== id) return d;
        if (d.status === 'downloading' || d.status === 'pending') {
          return { ...d, status: 'paused' as const };
        }
        if (d.status === 'paused' || d.status === 'failed') {
          return { ...d, status: 'downloading' as const };
        }
        return d;
      }),
    }));
  }, []);

  const removeDownload = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      downloads: prev.downloads.filter((d) => d.id !== id),
    }));
  }, []);

  const clearCompletedDownloads = useCallback(() => {
    setState((prev) => ({
      ...prev,
      downloads: prev.downloads.filter((d) => d.status !== 'completed'),
    }));
  }, []);

  const allSources = useMemo(
    () => [...INBUILT_SOURCES, ...state.customSources],
    [state.customSources],
  );

  const toggleSourceActive = useCallback((sourceId: string) => {
    setState((prev) => {
      const exists = prev.discoveryPrefs.activeSources.includes(sourceId);
      const next = exists
        ? prev.discoveryPrefs.activeSources.filter((s) => s !== sourceId)
        : [...prev.discoveryPrefs.activeSources, sourceId];
      return {
        ...prev,
        discoveryPrefs: { ...prev.discoveryPrefs, activeSources: next },
      };
    });
  }, []);

  const addExtensionRepo = useCallback(
    (url: string, manager: ExtensionRepo['manager'], name?: string) => {
      const cleanUrl = url.trim();
      if (!cleanUrl) return;
      const repoId = `repo-${Date.now()}`;
      const derivedName = name?.trim() || cleanUrl.split('/').pop() || 'Custom Repo';
      const newSource: SourceInfo = {
        id: `ext-${Date.now()}`,
        name: `${derivedName} Source`,
        type: 'extension',
        mediaTypes: manager === 'mangayomi' ? ['MANGA', 'ANIME'] : ['ANIME', 'MANGA'],
        lang: 'en',
        version: '1.0.0',
        repoUrl: cleanUrl,
        description: `Imported from ${manager} repository`,
      };
      setState((prev) => ({
        ...prev,
        repos: [
          {
            id: repoId,
            name: derivedName,
            url: cleanUrl,
            manager,
            addedAt: new Date().toISOString(),
          },
          ...prev.repos,
        ],
        customSources: [...prev.customSources, newSource],
        discoveryPrefs: {
          ...prev.discoveryPrefs,
          activeSources: [...prev.discoveryPrefs.activeSources, newSource.id],
        },
      }));
      addLog('INFO', 'Extensions', `Added ${manager} repository: ${derivedName}`);
    },
    [addLog],
  );

  const removeExtensionRepo = useCallback((id: string) => {
    setState((prev) => {
      const target = prev.repos.find((r) => r.id === id);
      return {
        ...prev,
        repos: prev.repos.filter((r) => r.id !== id),
        customSources: target
          ? prev.customSources.filter((s) => s.repoUrl !== target.url)
          : prev.customSources,
      };
    });
  }, []);

  const addComment = useCallback(
    (mediaId: string, body: string, spoiler = false) => {
      const text = body.trim();
      if (!text) return;
      const username =
        state.profiles[state.primaryTracker]?.username ||
        state.profiles.local?.username ||
        'Guest';
      const comment: CommentEntry = {
        id: `c-${Date.now()}`,
        mediaId,
        author: username,
        avatar: state.profiles[state.primaryTracker]?.avatarUrl,
        body: text,
        createdAt: new Date().toISOString(),
        likes: 0,
        spoiler,
      };
      setState((prev) => ({
        ...prev,
        comments: {
          ...prev.comments,
          [mediaId]: [comment, ...(prev.comments[mediaId] || [])],
        },
      }));
    },
    [state.profiles, state.primaryTracker],
  );

  const likeComment = useCallback((mediaId: string, commentId: string) => {
    setState((prev) => ({
      ...prev,
      comments: {
        ...prev.comments,
        [mediaId]: (prev.comments[mediaId] || []).map((c) =>
          c.id === commentId ? { ...c, likes: c.likes + 1 } : c,
        ),
      },
    }));
  }, []);

  const exportBackup = useCallback((): BackupManifest => {
    return {
      app: 'ShizuTv',
      version: '2.1.5',
      exportedAt: new Date().toISOString(),
      data: {
        themePrefs: state.themePrefs,
        uiPrefs: state.uiPrefs,
        contentPrefs: state.contentPrefs,
        homeSections: state.homeSections,
        playerPrefs: state.playerPrefs,
        readerPrefs: state.readerPrefs,
        library: state.library,
        history: state.history,
        repos: state.repos,
      },
    };
  }, [state]);

  const importBackup = useCallback(
    (manifest: BackupManifest) => {
      if ((manifest.app !== 'ShizuTv' && manifest.app !== 'ShonenX') || !manifest.data) {
        throw new Error('Invalid ShizuTv backup manifest');
      }
      setState((prev) => ({
        ...prev,
        ...manifest.data,
        themePrefs: { ...prev.themePrefs, ...(manifest.data.themePrefs || {}) },
        uiPrefs: { ...prev.uiPrefs, ...(manifest.data.uiPrefs || {}) },
        contentPrefs: { ...prev.contentPrefs, ...(manifest.data.contentPrefs || {}) },
      }));
      addLog('INFO', 'Backup', `Restored backup from ${manifest.exportedAt}`);
    },
    [addLog],
  );

  const resetAllData = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState(DEFAULT_STATE);
    addLog('WARN', 'System', 'Reset all preferences and local library');
  }, [addLog]);

  const effectiveMetadataTracker = useMemo((): Exclude<TrackerType, 'local'> => {
    const explicit = state.discoveryPrefs.metadataTrackerId;
    if (explicit && explicit !== 'local') return explicit;
    if (state.primaryTracker !== 'local') return state.primaryTracker;
    return 'anilist';
  }, [state.discoveryPrefs.metadataTrackerId, state.primaryTracker]);

  const value: AppContextValue = {
    state,
    isLocked,
    unlockApp,
    lockApp,
    logs,
    addLog,
    clearLogs,
    updateThemePrefs,
    applyPreset,
    updateUiPrefs,
    updateContentPrefs,
    updateDiscoveryPrefs,
    setHomeSections,
    updatePlayerPrefs,
    updateReaderPrefs,
    updateDiscordPrefs,
    updateSecurityPrefs,
    setPrimaryTracker,
    connectAniListToken,
    disconnectTracker,
    upsertLibraryEntry,
    removeLibraryEntry,
    getLibraryEntry,
    recordHistory,
    removeHistoryItem,
    clearHistoryForMedia,
    enqueueDownload,
    toggleDownloadPause,
    removeDownload,
    clearCompletedDownloads,
    allSources,
    toggleSourceActive,
    addExtensionRepo,
    removeExtensionRepo,
    addComment,
    likeComment,
    exportBackup,
    importBackup,
    resetAllData,
    effectiveMetadataTracker,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
