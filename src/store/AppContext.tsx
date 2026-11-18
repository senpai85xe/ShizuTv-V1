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
  AudioLanguageCode,
  DEFAULT_AMBIENT_ENABLED,
  DEFAULT_AUTO_PIP_ENABLED,
  SubtitleEdgeStylePref,
  SubtitleFontFamilyPref,
  SubtitleFontWeightPref,
} from '../utils/inlinePlayer';
import {
  DEFAULT_EPISODE_CHAPTER_STYLE,
  resolveEpisodeChapterStyle,
} from '../utils/episodeChapterStyle';
import {
  applyThemeToDocument,
  createDefaultThemePrefs,
  ThemePrefs,
} from '../utils/themeDefaults';
import {
  AppThemePreset,
  BUILT_IN_PRESETS,
  EpisodeChapterStyle,
  HeroBannerStyle,
  HomeHeaderStyle,
  MediaCardStyle,
  NavBarStyle,
} from '../data/themePresets';
import { INBUILT_SOURCES } from '../services/sourceEngine';
import { sortSourcesByOrder } from '../utils/extensionsManager';
import { fetchAniListViewer, saveAniListMediaEntry } from '../services/anilist';
import {
  clearAniListServerCookieSession,
  getStoredAniListToken,
  loginWithAniListOAuth,
  persistAniListServerCookieSession,
  persistAniListSession,
  resolveAniListInputToToken,
  restoreAniListSessionFromServer,
  type AniListAuthUrlResponse,
} from '../services/anilistAuth';

export type { ThemePrefs };

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

export type VideoFitMode = 'contain' | 'cover' | 'fill';
export type VideoQualityPref = 'auto' | '1080p' | '720p' | '480p' | '360p';
export type SubtitlePosition = 'bottom' | 'top';

export interface PlayerPrefs {
  defaultQuality: VideoQualityPref;
  autoPlay: boolean;
  autoSkipOp: boolean;
  autoSkipEd: boolean;
  autoNextEpisode: boolean;
  autoPip: boolean;
  ambientGlow: boolean;
  batterySaver: boolean;
  audioLanguage: AudioLanguageCode;
  defaultSpeed: number;
  videoFit: VideoFitMode;
  subtitleEnabled: boolean;
  subtitleSize: number;
  subtitleBackground: boolean;
  subtitleColor: string;
  subtitleOffsetSeconds: number;
  subtitlePosition: SubtitlePosition;
  subtitleFontFamily: SubtitleFontFamilyPref;
  subtitleFontWeight: SubtitleFontWeightPref;
  subtitleEdgeStyle: SubtitleEdgeStylePref;
  subtitleBgOpacity: number;
  subtitleBottomOffset: number;
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
  repoCatalog: SourceInfo[];
  customSources: SourceInfo[];
  sourceOrder: string[];
  comments: Record<string, CommentEntry[]>;
  onboardingDone: boolean;
}

const DEFAULT_STATE: PersistedState = {
  themePrefs: createDefaultThemePrefs(),
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
    autoPlay: true,
    autoSkipOp: false,
    autoSkipEd: false,
    autoNextEpisode: true,
    autoPip: DEFAULT_AUTO_PIP_ENABLED,
    ambientGlow: DEFAULT_AMBIENT_ENABLED,
    batterySaver: false,
    audioLanguage: 'ja',
    defaultSpeed: 1.0,
    videoFit: 'contain',
    subtitleEnabled: true,
    subtitleSize: 18,
    subtitleBackground: true,
    subtitleColor: '#ffffff',
    subtitleOffsetSeconds: 0,
    subtitlePosition: 'bottom',
    subtitleFontFamily: 'sans',
    subtitleFontWeight: 'bold',
    subtitleEdgeStyle: 'shadow',
    subtitleBgOpacity: 75,
    subtitleBottomOffset: 0,
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
  repos: [],
  repoCatalog: [],
  customSources: [],
  sourceOrder: [],
  comments: {},
  onboardingDone: true,
};

function loadInitialState(): PersistedState {
  const storedOAuthToken = getStoredAniListToken();
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      return {
        ...DEFAULT_STATE,
        anilistToken: storedOAuthToken,
      };
    }
    const parsed = JSON.parse(raw);
    const resolvedAnilistToken =
      typeof parsed.anilistToken === 'string' && parsed.anilistToken.trim()
        ? parsed.anilistToken.trim()
        : storedOAuthToken;
    const parsedRepos = Array.isArray(parsed.repos)
      ? (parsed.repos as ExtensionRepo[]).filter(
          (r) => r && r.id !== 'repo-shizutv-official' && !String(r.url || '').endsWith('.dart'),
        )
      : DEFAULT_STATE.repos;
    const parsedCustomSources = Array.isArray(parsed.customSources)
      ? (parsed.customSources as SourceInfo[])
      : DEFAULT_STATE.customSources;
    const parsedRepoCatalog = Array.isArray(parsed.repoCatalog)
      ? (parsed.repoCatalog as SourceInfo[])
      : DEFAULT_STATE.repoCatalog;
    const parsedSourceOrder = Array.isArray(parsed.sourceOrder)
      ? (parsed.sourceOrder as string[])
      : DEFAULT_STATE.sourceOrder;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      repos: parsedRepos,
      repoCatalog: parsedRepoCatalog,
      customSources: parsedCustomSources,
      sourceOrder: parsedSourceOrder,
      anilistToken: resolvedAnilistToken ?? null,
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
    return {
      ...DEFAULT_STATE,
      anilistToken: getStoredAniListToken(),
    };
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
  connectAniListToken: (token: string, expiresIn?: number | null) => Promise<TrackerProfile>;
  loginWithAniList: (preloadedAuth?: AniListAuthUrlResponse | null) => Promise<TrackerProfile>;
  logoutAniList: () => Promise<void>;
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
  setSourceOrder: (order: string[]) => void;
  installCatalogExtension: (source: SourceInfo) => void;
  installAllCatalogExtensions: (sources: SourceInfo[]) => number;
  uninstallExtension: (sourceId: string) => void;
  addExtensionRepo: (
    url: string,
    manager: ExtensionRepo['manager'],
    name?: string,
    options?: { autoInstall?: boolean; mediaType?: 'ANIME' | 'MANGA' | 'NOVEL' },
  ) => Promise<{ repo: ExtensionRepo; addedCount: number }>;
  refreshExtensionRepo: (repoId: string) => Promise<{ addedCount: number }>;
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

  // Restore AniList session from server HTTP-only cookie if local token is absent, or refresh viewer profile
  useEffect(() => {
    let active = true;
    const syncSession = async () => {
      let token = state.anilistToken || getStoredAniListToken();
      if (!token) {
        const restored = await restoreAniListSessionFromServer();
        token = restored?.accessToken ?? null;
      }
      if (!active || !token) return;
      if (!state.profiles.anilist || !state.anilistToken) {
        try {
          const profile = await fetchAniListViewer(token);
          if (!active) return;
          persistAniListSession({ accessToken: token });
          setState((prev) => ({
            ...prev,
            anilistToken: token,
            primaryTracker: prev.primaryTracker === 'local' ? 'anilist' : prev.primaryTracker,
            profiles: { ...prev.profiles, anilist: profile },
          }));
        } catch {
          // Ignore transient offline errors on startup
        }
      }
    };
    void syncSession();
    return () => {
      active = false;
    };
  }, []);

  // Apply active theme scheme & dark/AMOLED CSS variables to document root
  useEffect(() => {
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyThemeToDocument(document.documentElement, state.themePrefs, prefersDark);
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
    setState((prev) => {
      const next = { ...prev, playerPrefs: { ...prev.playerPrefs, ...patch } };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
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
    async (rawInput: string, expiresIn?: number | null) => {
      const resolved = await resolveAniListInputToToken(rawInput, expiresIn);
      const profile = await fetchAniListViewer(resolved.accessToken);
      persistAniListSession({
        accessToken: resolved.accessToken,
        expiresIn: resolved.expiresIn,
      });
      void persistAniListServerCookieSession(resolved.accessToken, resolved.expiresIn);
      setState((prev) => ({
        ...prev,
        anilistToken: resolved.accessToken,
        primaryTracker: 'anilist',
        profiles: { ...prev.profiles, anilist: profile },
      }));
      addLog('INFO', 'AniList', `Connected AniList account @${profile.username}`);
      return profile;
    },
    [addLog],
  );

  const loginWithAniList = useCallback(
    async (preloadedAuth?: AniListAuthUrlResponse | null) => {
      const session = await loginWithAniListOAuth(preloadedAuth);
      const profile = await fetchAniListViewer(session.accessToken);
      setState((prev) => ({
        ...prev,
        anilistToken: session.accessToken,
        primaryTracker: 'anilist',
        profiles: { ...prev.profiles, anilist: profile },
      }));
      addLog('INFO', 'AniList', `Signed in via AniList OAuth2 as @${profile.username}`);
      return profile;
    },
    [addLog],
  );

  const disconnectTracker = useCallback(
    (tracker: TrackerType) => {
      if (tracker === 'anilist') {
        void clearAniListServerCookieSession();
      }
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

  const logoutAniList = useCallback(async () => {
    await clearAniListServerCookieSession();
    setState((prev) => {
      const nextProfiles = { ...prev.profiles };
      delete nextProfiles.anilist;
      return {
        ...prev,
        anilistToken: null,
        primaryTracker: prev.primaryTracker === 'anilist' ? 'local' : prev.primaryTracker,
        profiles: nextProfiles,
      };
    });
    addLog('INFO', 'AniList', 'Logged out of AniList session');
  }, [addLog]);

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
    () => sortSourcesByOrder([...INBUILT_SOURCES, ...state.customSources], state.sourceOrder),
    [state.customSources, state.sourceOrder],
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

  const setSourceOrder = useCallback((order: string[]) => {
    setState((prev) => ({
      ...prev,
      sourceOrder: order,
    }));
  }, []);

  const installCatalogExtension = useCallback(
    (source: SourceInfo) => {
      setState((prev) => {
        const existsInbuilt = INBUILT_SOURCES.some((s) => s.id === source.id);
        const existsCustom = prev.customSources.some((s) => s.id === source.id);
        const nextCustom =
          existsInbuilt || existsCustom
            ? prev.customSources
            : [...prev.customSources, source];
        const nextActive = prev.discoveryPrefs.activeSources.includes(source.id)
          ? prev.discoveryPrefs.activeSources
          : [...prev.discoveryPrefs.activeSources, source.id];
        return {
          ...prev,
          customSources: nextCustom,
          discoveryPrefs: { ...prev.discoveryPrefs, activeSources: nextActive },
        };
      });
      addLog('INFO', 'Extensions', `Installed extension "${source.name}" (${source.lang.toUpperCase()})`);
    },
    [addLog],
  );

  const installAllCatalogExtensions = useCallback(
    (sources: SourceInfo[]): number => {
      if (sources.length === 0) return 0;
      let installedCount = 0;
      setState((prev) => {
        const existingIds = new Set([
          ...INBUILT_SOURCES.map((s) => s.id),
          ...prev.customSources.map((s) => s.id),
        ]);
        const newItems = sources.filter((s) => !existingIds.has(s.id));
        installedCount = newItems.length;
        const allowNsfw = prev.contentPrefs.adultContentMode !== 'safe';
        const autoEnable = newItems
          .filter((s) => allowNsfw || !s.isNsfw)
          .map((s) => s.id);
        return {
          ...prev,
          customSources: [...prev.customSources, ...newItems],
          discoveryPrefs: {
            ...prev.discoveryPrefs,
            activeSources: Array.from(
              new Set([...prev.discoveryPrefs.activeSources, ...autoEnable]),
            ),
          },
        };
      });
      addLog('INFO', 'Extensions', `Batch installed ${sources.length} catalog extensions`);
      return installedCount || sources.length;
    },
    [addLog],
  );

  const uninstallExtension = useCallback(
    (sourceId: string) => {
      const isInbuilt = INBUILT_SOURCES.some((s) => s.id === sourceId);
      setState((prev) => {
        if (isInbuilt) {
          return {
            ...prev,
            discoveryPrefs: {
              ...prev.discoveryPrefs,
              activeSources: prev.discoveryPrefs.activeSources.filter((id) => id !== sourceId),
            },
          };
        }
        return {
          ...prev,
          customSources: prev.customSources.filter((s) => s.id !== sourceId),
          sourceOrder: prev.sourceOrder.filter((id) => id !== sourceId),
          discoveryPrefs: {
            ...prev.discoveryPrefs,
            activeSources: prev.discoveryPrefs.activeSources.filter((id) => id !== sourceId),
          },
        };
      });
      addLog(
        'INFO',
        'Extensions',
        isInbuilt
          ? `Disabled inbuilt source "${sourceId}"`
          : `Uninstalled extension "${sourceId}"`,
      );
    },
    [addLog],
  );

  const addExtensionRepo = useCallback(
    async (
      url: string,
      manager: ExtensionRepo['manager'],
      name?: string,
      options?: { autoInstall?: boolean; mediaType?: 'ANIME' | 'MANGA' | 'NOVEL' },
    ): Promise<{ repo: ExtensionRepo; addedCount: number }> => {
      const cleanUrl = url.trim();
      if (!cleanUrl) {
        throw new Error('Please enter a repository manifest URL.');
      }

      const response = await fetch('/api/extensions/fetch-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: cleanUrl,
          manager,
          name: name?.trim() || undefined,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        repoName?: string;
        format?: string;
        sources?: SourceInfo[];
        message?: string;
      };

      if (!response.ok || !Array.isArray(payload.sources) || payload.sources.length === 0) {
        throw new Error(payload.message || 'Failed to fetch extension repository manifest.');
      }

      const resolvedName =
        name?.trim() || payload.repoName?.trim() || cleanUrl.split('/').pop() || 'Extension Repo';
      const resolvedManager: ExtensionRepo['manager'] =
        payload.format === 'aniyomi' ||
        payload.format === 'mangayomi' ||
        payload.format === 'cloudstream'
          ? payload.format
          : manager;

      const importedSources = payload.sources;
      const allowNsfw = state.contentPrefs.adultContentMode !== 'safe';
      const shouldAutoInstall = options?.autoInstall === true;
      const newRepo: ExtensionRepo = {
        id: `repo-${Date.now()}`,
        name: resolvedName,
        url: cleanUrl,
        manager: resolvedManager,
        mediaType: options?.mediaType,
        addedAt: new Date().toISOString(),
      };

      setState((prev) => {
        const existingRepo = prev.repos.find((r) => r.url === cleanUrl);
        const upsertedRepo: ExtensionRepo = existingRepo
          ? {
              ...existingRepo,
              name: resolvedName,
              manager: resolvedManager,
              mediaType: options?.mediaType ?? existingRepo.mediaType,
            }
          : newRepo;

        const remainingCatalog = prev.repoCatalog.filter((s) => s.repoUrl !== cleanUrl);
        const importedById = new Map(importedSources.map((s) => [s.id, s]));

        // Update any already-installed custom sources from this repo with refreshed metadata
        const updatedCustom = prev.customSources.map((src) =>
          src.repoUrl === cleanUrl && importedById.has(src.id)
            ? importedById.get(src.id)!
            : src,
        );

        let nextCustom = updatedCustom;
        let nextActiveSources = prev.discoveryPrefs.activeSources;

        if (shouldAutoInstall) {
          const existingIds = new Set([
            ...INBUILT_SOURCES.map((s) => s.id),
            ...updatedCustom.map((s) => s.id),
          ]);
          const newInstall = importedSources.filter((s) => !existingIds.has(s.id));
          nextCustom = [...updatedCustom, ...newInstall];
          const autoEnabledIds = newInstall
            .filter((s) => allowNsfw || !s.isNsfw)
            .map((s) => s.id);
          nextActiveSources = Array.from(new Set([...nextActiveSources, ...autoEnabledIds]));
        }

        return {
          ...prev,
          repos: existingRepo
            ? prev.repos.map((r) => (r.url === cleanUrl ? upsertedRepo : r))
            : [upsertedRepo, ...prev.repos],
          repoCatalog: [...remainingCatalog, ...importedSources],
          customSources: nextCustom,
          discoveryPrefs: {
            ...prev.discoveryPrefs,
            activeSources: nextActiveSources,
          },
        };
      });

      addLog(
        'INFO',
        'Extensions',
        `Loaded ${importedSources.length} catalog sources from ${resolvedName} (${resolvedManager})`,
      );
      return { repo: newRepo, addedCount: importedSources.length };
    },
    [addLog, state.contentPrefs.adultContentMode],
  );

  const refreshExtensionRepo = useCallback(
    async (repoId: string): Promise<{ addedCount: number }> => {
      const target = state.repos.find((r) => r.id === repoId);
      if (!target) {
        throw new Error('Repository not found.');
      }
      const result = await addExtensionRepo(target.url, target.manager, target.name, {
        mediaType: target.mediaType,
      });
      return { addedCount: result.addedCount };
    },
    [addExtensionRepo, state.repos],
  );

  const removeExtensionRepo = useCallback((id: string) => {
    setState((prev) => {
      const target = prev.repos.find((r) => r.id === id);
      const removedSourceIds = target
        ? new Set(prev.customSources.filter((s) => s.repoUrl === target.url).map((s) => s.id))
        : new Set<string>();
      return {
        ...prev,
        repos: prev.repos.filter((r) => r.id !== id),
        repoCatalog: target
          ? prev.repoCatalog.filter((s) => s.repoUrl !== target.url)
          : prev.repoCatalog,
        customSources: target
          ? prev.customSources.filter((s) => s.repoUrl !== target.url)
          : prev.customSources,
        discoveryPrefs: {
          ...prev.discoveryPrefs,
          activeSources: prev.discoveryPrefs.activeSources.filter(
            (srcId) => !removedSourceIds.has(srcId),
          ),
        },
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
    loginWithAniList,
    logoutAniList,
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
    setSourceOrder,
    installCatalogExtension,
    installAllCatalogExtensions,
    uninstallExtension,
    addExtensionRepo,
    refreshExtensionRepo,
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
