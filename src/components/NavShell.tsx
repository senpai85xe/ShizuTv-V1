import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Search, BookMarked, Download, Settings, Calendar, Tv } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { ShonenXLogo } from './ShonenXLogo';
import { useSlidingPill } from '../hooks/useSlidingPill';
import {
  getRouteTransitionClass,
  getRouteTransitionKind,
  RouteTransitionKind,
} from '../utils/appMotion';

interface NavShellProps {
  children: React.ReactNode;
}

export const NavShell: React.FC<NavShellProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, updateUiPrefs } = useApp();

  const navStyle = state.uiPrefs.navBarStyle;
  const isTvMode = state.uiPrefs.useNewUi;

  const activeDownloads = state.downloads.filter(
    (d) => d.status === 'downloading' || d.status === 'pending',
  );
  const downloadCount = activeDownloads.length;

  const navItems = [
    { path: '/home', label: 'Home', icon: Home },
    { path: '/discover', label: 'Discover', icon: Search },
    { path: '/library', label: 'Library', icon: BookMarked },
    { path: '/downloads', label: 'Downloads', icon: Download, badge: downloadCount },
  ];

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  const prevPathRef = useRef<string | null>(null);
  const transitionRef = useRef<{ path: string; kind: RouteTransitionKind }>({
    path: location.pathname,
    kind: 'none',
  });
  if (transitionRef.current.path !== location.pathname) {
    transitionRef.current = {
      path: location.pathname,
      kind: getRouteTransitionKind(prevPathRef.current, location.pathname),
    };
    prevPathRef.current = location.pathname;
  } else if (prevPathRef.current === null) {
    prevPathRef.current = location.pathname;
  }

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  const transitionKind = transitionRef.current.kind;
  const transitionClass = getRouteTransitionClass(transitionKind);

  const tvActivePath =
    ['/home', '/discover', '/library', '/downloads', '/calendar'].find((p) => isActive(p)) || '';
  const sideActivePath = ['/home', '/discover', '/library'].find((p) => isActive(p)) || '';
  const mobileActivePath =
    ['/home', '/discover', '/library', '/downloads'].find((p) => isActive(p)) || '';

  const tvPill = useSlidingPill<HTMLElement>(tvActivePath, isTvMode);
  const sidePill = useSlidingPill<HTMLElement>(sideActivePath, `${isTvMode}-${navStyle}`);
  const mobilePill = useSlidingPill<HTMLElement>(mobileActivePath, `${isTvMode}-${navStyle}`);

  const roundness = `${Math.min(20, state.themePrefs.uiRoundness)}px`;

  if (isTvMode) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-8 px-8 py-4 bg-[var(--sx-surface)]/85 backdrop-blur-xl border-b border-[var(--sx-outline)]">
          <button
            type="button"
            onClick={() => navigate('/home')}
            className="flex items-center gap-2.5 text-lg font-black tracking-tight text-[var(--sx-on-surface)] whitespace-nowrap shrink-0 group"
          >
            <ShonenXLogo size={28} className="transition-transform duration-200 group-hover:scale-105" />
            <span>ShizuTv</span>
          </button>

          <nav ref={tvPill.containerRef} className="relative flex items-center gap-4">
            {tvPill.pillRect.ready && (
              <span
                aria-hidden="true"
                style={{
                  transform: `translate3d(${tvPill.pillRect.left}px, ${tvPill.pillRect.top}px, 0)`,
                  width: `${tvPill.pillRect.width}px`,
                  height: `${tvPill.pillRect.height}px`,
                }}
                className="sx-pill-glide pointer-events-none absolute left-0 top-0 rounded-lg bg-[var(--sx-primary)] shadow-sm"
              />
            )}
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  ref={tvPill.registerItemRef(item.path)}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className={`relative z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? tvPill.pillRect.ready
                        ? 'text-[var(--sx-on-primary)]'
                        : 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                      : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {item.badge ? (
                    <span className="ml-1 text-[11px] font-mono-tabular">({item.badge})</span>
                  ) : null}
                </button>
              );
            })}
            <button
              ref={tvPill.registerItemRef('/calendar')}
              type="button"
              onClick={() => navigate('/calendar')}
              className={`relative z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors whitespace-nowrap shrink-0 ${
                isActive('/calendar')
                  ? tvPill.pillRect.ready
                    ? 'text-[var(--sx-on-primary)]'
                    : 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                  : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Calendar</span>
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => updateUiPrefs({ useNewUi: false })}
              title="Exit TV Mode"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--sx-surface-high)] text-[var(--sx-on-surface)] hover:bg-[var(--sx-primary)] hover:text-[var(--sx-on-primary)] transition-colors whitespace-nowrap shrink-0"
            >
              <Tv className="w-3.5 h-3.5" />
              <span>Standard UI</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="p-2 rounded-lg bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)] transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>
        <main className="flex-1 pb-12 overflow-x-clip">
          <div
            key={location.pathname}
            data-testid="app-route-stage"
            data-transition={transitionKind}
            className={transitionClass}
          >
            {children}
          </div>
        </main>
      </div>
    );
  }

  const isDocked = navStyle === 'docked';
  const isFrosted = navStyle === 'frosted';

  return (
    <div className="min-h-screen flex flex-col md:flex-row landscape:flex-row">
      {/* Desktop / Tablet / Rotated Phone Side Rail */}
      <aside
        className={`hidden md:flex landscape:flex flex-col justify-between shrink-0 z-30 sticky top-0 h-dvh overflow-y-auto no-scrollbar transition-all duration-200 ${
          isDocked
            ? 'w-20 short-screen:w-[68px] bg-[var(--sx-surface-container)] border-r border-[var(--sx-outline)] py-5 short-screen:py-2'
            : 'w-[84px] short-screen:w-[72px] py-5 short-screen:py-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-1'
        }`}
      >
        <div
          style={{ borderRadius: isDocked ? '0px' : roundness }}
          className={`flex-1 flex flex-col items-center py-4 short-screen:py-2 gap-2 short-screen:gap-1 ${
            isDocked
              ? ''
              : isFrosted
                ? 'bg-[var(--sx-surface-container)]/75 backdrop-blur-xl border border-[var(--sx-outline)] shadow-lg'
                : 'bg-[var(--sx-surface-container)] border border-[var(--sx-outline)]'
          }`}
        >
          <button
            type="button"
            onClick={() => navigate('/home')}
            className="mb-4 short-screen:mb-1 p-2 short-screen:p-1 rounded-xl hover:scale-105 active:scale-95 transition-transform flex flex-col items-center gap-1 shrink-0"
            title="ShizuTv Home"
          >
            <ShonenXLogo size={28} />
          </button>

          <nav
            ref={sidePill.containerRef}
            className="relative flex-1 flex flex-col items-center justify-center gap-2 short-screen:gap-1 w-full px-2 short-screen:px-1.5"
          >
            {sidePill.pillRect.ready && (
              <span
                aria-hidden="true"
                style={{
                  transform: `translate3d(${sidePill.pillRect.left}px, ${sidePill.pillRect.top}px, 0)`,
                  width: `${sidePill.pillRect.width}px`,
                  height: `${sidePill.pillRect.height}px`,
                  borderRadius: `calc(${roundness} * 0.75)`,
                }}
                className="sx-pill-glide pointer-events-none absolute left-0 top-0 bg-[var(--sx-primary)] shadow-sm"
              />
            )}
            {navItems.slice(0, 3).map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  ref={sidePill.registerItemRef(item.path)}
                  type="button"
                  onClick={() => navigate(item.path)}
                  style={{ borderRadius: `calc(${roundness} * 0.75)` }}
                  className={`relative z-10 w-full py-3 short-screen:py-1.5 flex flex-col items-center justify-center gap-1 short-screen:gap-0.5 transition-colors duration-200 ${
                    active
                      ? sidePill.pillRect.ready
                        ? 'text-[var(--sx-on-primary)]'
                        : 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] shadow-sm'
                      : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] hover:bg-[var(--sx-surface-high)]'
                  }`}
                >
                  <Icon className="w-5 h-5 short-screen:w-4 short-screen:h-4" />
                  <span className="text-[10px] short-screen:text-[9px] font-bold tracking-tight leading-none">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="flex flex-col items-center gap-2 short-screen:gap-1 w-full px-2 short-screen:px-1.5 pt-2 short-screen:pt-1.5 border-t border-[var(--sx-outline)] shrink-0">
            <button
              type="button"
              onClick={() => navigate('/calendar')}
              style={{ borderRadius: `calc(${roundness} * 0.75)` }}
              title="Airing Calendar"
              className={`w-full py-2.5 short-screen:py-1.5 flex flex-col items-center justify-center gap-1 short-screen:gap-0.5 transition-colors ${
                isActive('/calendar')
                  ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                  : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] hover:bg-[var(--sx-surface-high)]'
              }`}
            >
              <Calendar className="w-4 h-4 short-screen:w-3.5 short-screen:h-3.5" />
              <span className="text-[10px] short-screen:text-[9px] font-semibold leading-none">
                Calendar
              </span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/settings')}
              style={{ borderRadius: `calc(${roundness} * 0.75)` }}
              title="Settings"
              className={`w-full py-2.5 short-screen:py-1.5 flex flex-col items-center justify-center gap-1 short-screen:gap-0.5 transition-colors ${
                isActive('/settings')
                  ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                  : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] hover:bg-[var(--sx-surface-high)]'
              }`}
            >
              <Settings className="w-4 h-4 short-screen:w-3.5 short-screen:h-3.5" />
              <span className="text-[10px] short-screen:text-[9px] font-semibold leading-none">
                Settings
              </span>
            </button>
          </div>
        </div>

        {/* Separate Downloads Pill on Side Rail */}
        <button
          type="button"
          onClick={() => navigate('/downloads')}
          style={{ borderRadius: isDocked ? '0px' : roundness }}
          className={`mt-3 short-screen:mt-1.5 py-4 short-screen:py-2 shrink-0 flex flex-col items-center justify-center gap-1 short-screen:gap-0.5 relative transition-all ${
            isDocked
              ? 'mx-2 rounded-xl'
              : isFrosted
                ? 'bg-[var(--sx-surface-container)]/75 backdrop-blur-xl border border-[var(--sx-outline)]'
                : 'bg-[var(--sx-surface-container)] border border-[var(--sx-outline)]'
          } ${
            isActive('/downloads')
              ? 'bg-[var(--sx-primary)]! text-[var(--sx-on-primary)]!'
              : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
          }`}
        >
          <Download className="w-5 h-5 short-screen:w-4 short-screen:h-4" />
          <span className="text-[10px] short-screen:text-[9px] font-bold leading-none">
            Downloads
          </span>
          {downloadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-[9px] font-bold flex items-center justify-center tabular-nums">
              {downloadCount}
            </span>
          )}
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-24 md:pb-10 landscape:pb-10 overflow-x-clip">
        <div
          key={location.pathname}
          data-testid="app-route-stage"
          data-transition={transitionKind}
          className={transitionClass}
        >
          {children}
        </div>
      </main>

      {/* Portrait Mobile Bottom NavBar */}
      <div
        className={`md:hidden landscape:hidden fixed bottom-0 inset-x-0 z-40 ${
          isDocked
            ? 'pb-[env(safe-area-inset-bottom)]'
            : 'px-4 pb-[max(0.625rem,env(safe-area-inset-bottom))] pointer-events-none'
        }`}
      >
        <nav
          ref={mobilePill.containerRef}
          style={{ borderRadius: isDocked ? '0px' : '22px' }}
          className={`relative pointer-events-auto flex items-center justify-around h-14 px-2 transition-all duration-200 ${
            isDocked
              ? 'bg-[var(--sx-surface-container)] border-t border-[var(--sx-outline)]'
              : isFrosted
                ? 'bg-[var(--sx-surface-container)]/78 backdrop-blur-2xl border border-[var(--sx-outline)] shadow-[0_12px_36px_-10px_rgba(0,0,0,0.45)]'
                : 'bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] shadow-xl'
          }`}
        >
          {mobilePill.pillRect.ready && (
            <span
              aria-hidden="true"
              data-testid="mobile-nav-pill"
              style={{
                transform: `translate3d(${mobilePill.pillRect.left}px, ${mobilePill.pillRect.top}px, 0)`,
                width: `${mobilePill.pillRect.width}px`,
                height: `${mobilePill.pillRect.height}px`,
                borderRadius: '14px',
              }}
              className="sx-pill-glide pointer-events-none absolute left-0 top-0 bg-[var(--sx-primary)] shadow-sm"
            />
          )}
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                ref={mobilePill.registerItemRef(item.path)}
                type="button"
                onClick={() => navigate(item.path)}
                style={{ borderRadius: '14px' }}
                className={`relative z-10 flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 py-1.5 text-xs font-bold transition-colors duration-200 ${
                  active
                    ? mobilePill.pillRect.ready
                      ? 'text-[var(--sx-on-primary)]'
                      : 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] shadow-sm'
                    : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {active && (
                  <span className="sx-nav-label-enter whitespace-nowrap">{item.label}</span>
                )}
                {item.badge ? (
                  <span className="ml-0.5 text-[10px] font-mono-tabular">({item.badge})</span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
