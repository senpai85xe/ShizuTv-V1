import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Compass, Moon, Puzzle, Settings, Sun, User } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { SmartImage } from './SmartImage';
import { ShizuTvLogo } from './ShonenXLogo';
import { resolveEffectiveIsDark } from '../utils/themeDefaults';
import { triggerThemeWaveTransition } from '../utils/themeWaveTransition';

interface HomeHeaderProps {
  onOpenProfile: () => void;
  onOpenDiscoveryMode: () => void;
}

export const HomeHeader: React.FC<HomeHeaderProps> = ({
  onOpenProfile,
  onOpenDiscoveryMode,
}) => {
  const navigate = useNavigate();
  const { state, effectiveMetadataTracker, updateThemePrefs } = useApp();
  const themeToggleRef = useRef<HTMLButtonElement | null>(null);
  const style = state.uiPrefs.homeHeaderStyle;
  const profile = state.profiles[state.primaryTracker] || state.profiles.local;
  const username = profile?.username || 'Guest';
  const avatarUrl = profile?.avatarUrl;
  const isTrackerMode = state.discoveryPrefs.mode === 'tracker';
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = resolveEffectiveIsDark(state.themePrefs.themeMode, prefersDark);

  const handleToggleThemeWave = () => {
    void triggerThemeWaveTransition({
      sourceEl: themeToggleRef.current,
      themePrefs: state.themePrefs,
      onCommitMode: (nextMode) => updateThemePrefs({ themeMode: nextMode }),
    });
  };

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const trackerLabel =
    effectiveMetadataTracker === 'myanimelist'
      ? 'MyAnimeList'
      : effectiveMetadataTracker === 'kitsu'
        ? 'Kitsu'
        : 'AniList';

  const actionButtons = (
    <div className="flex items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={onOpenDiscoveryMode}
        title={isTrackerMode ? `Discovery: ${trackerLabel}` : 'Discovery: Extensions'}
        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--sx-radius)] text-xs font-bold border transition-all duration-150 active:scale-95 ${
          isTrackerMode
            ? 'bg-[var(--sx-primary-container)]/35 border-[var(--sx-primary)]/40 text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)]'
            : 'bg-[var(--sx-surface-container)] border-[var(--sx-outline)] text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)]'
        }`}
      >
        {isTrackerMode ? (
          <Compass className="w-4 h-4 text-[var(--sx-primary)]" />
        ) : (
          <Puzzle className="w-4 h-4 text-[var(--sx-primary)]" />
        )}
        <span className="hidden sm:inline whitespace-nowrap">
          {isTrackerMode ? trackerLabel : 'Extensions'}
        </span>
      </button>

      <button
        type="button"
        onClick={() => navigate('/calendar')}
        title="Airing Calendar"
        aria-label="Airing Calendar"
        className="p-2.5 rounded-[var(--sx-radius)] bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)] transition-all duration-150 active:scale-95"
      >
        <Calendar className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => navigate('/settings')}
        title="Settings"
        aria-label="Settings"
        className="p-2.5 rounded-[var(--sx-radius)] bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)] transition-all duration-150 active:scale-95"
      >
        <Settings className="w-4 h-4" />
      </button>
    </div>
  );

  const avatar = avatarUrl ? (
    <SmartImage
      src={avatarUrl}
      alt={username}
      className="w-full h-full object-cover"
    />
  ) : (
    <div className="w-full h-full flex items-center justify-center bg-[var(--sx-primary-container)] text-[var(--sx-on-primary-container)]">
      <User className="w-4 h-4" />
    </div>
  );

  // New Header Style #8: Clean Wave (Clean brand bar + Dark/Light wave toggle next to Profile button)
  if (style === 'cleanWave') {
    return (
      <header className="px-4 sm:px-6 pt-5 pb-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/home')}
            className="w-11 h-11 rounded-full bg-[var(--sx-primary)]/15 border border-[var(--sx-primary)]/20 flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 transition-transform"
            aria-label="ShizuTv Home"
          >
            <ShizuTvLogo size={22} />
          </button>
          <div className="min-w-0 leading-tight">
            <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-[var(--sx-on-surface)] truncate">
              ShizuTv
            </h1>
            <p className="text-xs font-medium text-[var(--sx-on-surface-muted)] truncate">
              {greeting}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            ref={themeToggleRef}
            type="button"
            data-testid="home-theme-wave-toggle"
            onClick={handleToggleThemeWave}
            aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="relative w-11 h-11 rounded-full bg-[var(--sx-primary)]/15 hover:bg-[var(--sx-primary)]/25 border border-[var(--sx-primary)]/25 flex items-center justify-center overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-92 shrink-0"
          >
            <Sun
              className={`w-5 h-5 text-[var(--sx-on-surface)] absolute transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                isDark
                  ? 'opacity-100 rotate-0 scale-100'
                  : 'opacity-0 -rotate-90 scale-50'
              }`}
            />
            <Moon
              className={`w-5 h-5 text-[var(--sx-on-surface)] absolute transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                isDark
                  ? 'opacity-0 rotate-90 scale-50'
                  : 'opacity-100 rotate-0 scale-100'
              }`}
            />
          </button>

          <button
            type="button"
            onClick={onOpenProfile}
            aria-label="Open profile and quick menu"
            title="Profile & Quick Menu"
            className="w-11 h-11 rounded-full bg-[var(--sx-primary)]/15 hover:bg-[var(--sx-primary)]/25 border border-[var(--sx-primary)]/25 flex items-center justify-center overflow-hidden transition-all active:scale-95 shrink-0"
          >
            {avatarUrl ? (
              <SmartImage src={avatarUrl} alt={username} className="w-full h-full object-cover" />
            ) : (
              <User className="w-5 h-5 text-[var(--sx-on-surface)]" />
            )}
          </button>
        </div>
      </header>
    );
  }

  // New Header Style #7: Clean (Avatar-free minimal brand bar + single Profile Sheet button)
  if (style === 'clean') {
    return (
      <header className="px-4 sm:px-6 pt-5 pb-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/home')}
            className="w-11 h-11 rounded-full bg-[var(--sx-primary)]/15 border border-[var(--sx-primary)]/20 flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 transition-transform"
            aria-label="ShizuTv Home"
          >
            <ShizuTvLogo size={22} />
          </button>
          <div className="min-w-0 leading-tight">
            <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-[var(--sx-on-surface)] truncate">
              ShizuTv
            </h1>
            <p className="text-xs font-medium text-[var(--sx-on-surface-muted)] truncate">
              {greeting}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenProfile}
          aria-label="Open profile and quick menu"
          title="Profile & Quick Menu"
          className="w-11 h-11 rounded-full bg-[var(--sx-primary)]/15 hover:bg-[var(--sx-primary)]/25 border border-[var(--sx-primary)]/25 flex items-center justify-center overflow-hidden transition-all active:scale-95 shrink-0"
        >
          {avatarUrl ? (
            <SmartImage src={avatarUrl} alt={username} className="w-full h-full object-cover" />
          ) : (
            <User className="w-5 h-5 text-[var(--sx-on-surface)]" />
          )}
        </button>
      </header>
    );
  }

  // New Header Style #6: ShizuTv (Prominent ShizuTv emblem + quick controls + profile avatar)
  if (style === 'shizutv') {
    return (
      <header className="px-4 sm:px-6 pt-5 pb-2 flex items-center justify-between gap-2.5 sm:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenProfile}
            className="flex items-center gap-2.5 sm:gap-3 text-left min-w-0 group"
          >
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] flex items-center justify-center shadow-sm group-hover:border-[var(--sx-primary)]/50 transition-all duration-200 shrink-0">
              <ShizuTvLogo size={24} />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-black tracking-tight truncate group-hover:text-[var(--sx-primary)] transition-colors">
                ShizuTv
              </h1>
              <p className="text-[11px] sm:text-xs font-medium text-[var(--sx-on-surface-muted)] truncate">
                <span>{greeting}</span>
                <span className="hidden sm:inline">, {username}</span>
              </p>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {actionButtons}
          <button
            type="button"
            onClick={onOpenProfile}
            aria-label="Open tracker profile"
            title={`Profile: ${username}`}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full p-0.5 border border-[var(--sx-primary)]/60 hover:scale-105 active:scale-95 transition-transform shrink-0"
          >
            <div className="w-full h-full rounded-full overflow-hidden">{avatar}</div>
          </button>
        </div>
      </header>
    );
  }

  // Original Style #5: Docked
  if (style === 'docked') {
    return (
      <header className="w-full bg-[var(--sx-surface-container)] border-b border-[var(--sx-outline)] px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onOpenProfile}
          className="flex items-center gap-3 text-left min-w-0"
        >
          <div className="w-9 h-9 rounded-full overflow-hidden border border-[var(--sx-primary)]/40 shrink-0">
            {avatar}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-[var(--sx-on-surface-muted)]">
              {greeting}
            </p>
            <p className="text-sm font-extrabold truncate">{username}</p>
          </div>
        </button>
        {actionButtons}
      </header>
    );
  }

  // Original Style #4: Minimal
  if (style === 'minimal') {
    return (
      <header className="px-4 sm:px-6 pt-5 pb-2 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onOpenProfile}
          className="flex items-center gap-2.5 text-left min-w-0"
        >
          <div className="w-8 h-8 rounded-[var(--sx-radius)] overflow-hidden border border-[var(--sx-outline)] shrink-0">
            {avatar}
          </div>
          <span className="font-extrabold text-base truncate">{username}</span>
          <span className="text-xs text-[var(--sx-on-surface-muted)] hidden sm:inline">
            · {trackerLabel}
          </span>
        </button>
        {actionButtons}
      </header>
    );
  }

  // Original Style #3: Material
  if (style === 'material') {
    return (
      <header className="px-4 sm:px-6 pt-5 pb-2 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onOpenProfile}
          className="flex items-center gap-3 px-3.5 py-2 rounded-full bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] hover:border-[var(--sx-primary)]/50 transition-colors min-w-0"
        >
          <div className="w-7 h-7 rounded-full overflow-hidden shrink-0">{avatar}</div>
          <span className="font-bold text-sm truncate">{username}</span>
        </button>
        {actionButtons}
      </header>
    );
  }

  // Original Styles #1 & #2: Prominent & Classic
  return (
    <header className="px-4 sm:px-6 pt-5 pb-2 flex items-center justify-between gap-4">
      <button
        type="button"
        onClick={onOpenProfile}
        className="flex items-center gap-3.5 text-left min-w-0 group"
      >
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full overflow-hidden border-2 border-[var(--sx-primary)]/60 group-hover:scale-105 transition-transform shrink-0">
          {avatar}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--sx-on-surface-muted)]">{greeting}</p>
          <h1 className="text-lg sm:text-xl font-extrabold tracking-tight truncate group-hover:text-[var(--sx-primary)] transition-colors">
            {username}
          </h1>
        </div>
      </button>

      {actionButtons}
    </header>
  );
};
