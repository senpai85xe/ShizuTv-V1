export type RouteTransitionKind = 'tab' | 'push' | 'pop' | 'none';

const TOP_LEVEL_TABS = [
  '/home',
  '/discover',
  '/watch-together',
  '/library',
  '/downloads',
  '/calendar',
  '/settings',
];

function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/home';
  return pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;
}

function getDepth(pathname: string): number {
  const norm = normalizePath(pathname);
  return norm.split('/').filter(Boolean).length;
}

function isTopLevelTab(pathname: string): boolean {
  const norm = normalizePath(pathname);
  return TOP_LEVEL_TABS.includes(norm);
}

/**
 * Classifies route navigation transitions so tab switches cross-scale cleanly,
 * deeper detail/settings screens push in horizontally like iOS UINavigationController,
 * and returning up pops back smoothly.
 */
export function getRouteTransitionKind(
  prevPathname: string | null | undefined,
  nextPathname: string,
): RouteTransitionKind {
  const next = normalizePath(nextPathname);
  if (!prevPathname) return 'none';
  const prev = normalizePath(prevPathname);
  if (prev === next) return 'none';

  if (isTopLevelTab(prev) && isTopLevelTab(next)) {
    return 'tab';
  }

  const prevDepth = getDepth(prev);
  const nextDepth = getDepth(next);

  if (nextDepth > prevDepth || next.startsWith('/details/') || next.startsWith('/continue/')) {
    return 'push';
  }
  if (nextDepth < prevDepth || (isTopLevelTab(next) && !isTopLevelTab(prev))) {
    return 'pop';
  }
  return 'push';
}

export function getRouteTransitionClass(kind: RouteTransitionKind): string {
  switch (kind) {
    case 'tab':
      return 'sx-page-tab-enter';
    case 'push':
      return 'sx-page-push-enter';
    case 'pop':
      return 'sx-page-pop-enter';
    case 'none':
    default:
      return '';
  }
}

export interface PillRect {
  left: number;
  top: number;
  width: number;
  height: number;
  ready: boolean;
}

export function measureRelativePillRect(
  containerRect: { left: number; top: number },
  targetRect: { left: number; top: number; width: number; height: number },
): PillRect {
  return {
    left: targetRect.left - containerRect.left,
    top: targetRect.top - containerRect.top,
    width: targetRect.width,
    height: targetRect.height,
    ready: targetRect.width > 0 && targetRect.height > 0,
  };
}

export function getBoundedStaggerDelay(
  index: number,
  stepMs = 24,
  maxSteps = 10,
): number {
  if (index <= 0 || stepMs <= 0 || maxSteps <= 0) return 0;
  return Math.min(index, maxSteps) * stepMs;
}

export function isRectInRevealViewport(
  top: number,
  bottom: number,
  viewportHeight: number,
  marginPx = 40,
): boolean {
  if (viewportHeight <= 0) return true;
  if (top === 0 && bottom === 0) return true;
  return top <= viewportHeight + marginPx && bottom >= -marginPx;
}
