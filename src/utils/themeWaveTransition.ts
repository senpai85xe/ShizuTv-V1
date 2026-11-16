import { flushSync } from 'react-dom';
import { ThemeMode } from '../data/themePresets';
import {
  applyThemeToDocument,
  resolveEffectiveIsDark,
  ThemePrefs,
} from './themeDefaults';

export interface WaveRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface WaveViewport {
  width: number;
  height: number;
}

export interface WaveGeometry {
  x: number;
  y: number;
  endRadius: number;
}

// iOS-inspired fluid deceleration curve with an unhurried, silky sweep
export const THEME_WAVE_DURATION_MS = 920;
export const THEME_WAVE_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';

let activeWavePromise: Promise<'light' | 'dark'> | null = null;

export function getNextToggledThemeMode(
  currentMode: ThemeMode,
  prefersDark: boolean,
): 'light' | 'dark' {
  const currentlyDark = resolveEffectiveIsDark(currentMode, prefersDark);
  return currentlyDark ? 'light' : 'dark';
}

export function computeWaveGeometry(
  rect: WaveRect,
  viewport: WaveViewport,
): WaveGeometry {
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const maxX = Math.max(x, viewport.width - x);
  const maxY = Math.max(y, viewport.height - y);
  const endRadius = Math.hypot(maxX, maxY);
  return { x, y, endRadius };
}

function spawnWavefrontRing(
  geometry: WaveGeometry,
  targetMode: 'light' | 'dark',
) {
  if (typeof document === 'undefined') return;
  const ring = document.createElement('div');
  ring.setAttribute('aria-hidden', 'true');
  const diameter = geometry.endRadius * 2;
  const edgeHighlight =
    targetMode === 'dark'
      ? 'rgba(0, 229, 255, 0.34)'
      : 'rgba(255, 255, 255, 0.72)';
  const outerHalo =
    targetMode === 'dark'
      ? 'rgba(0, 229, 255, 0.14)'
      : 'rgba(15, 23, 42, 0.10)';

  ring.style.position = 'fixed';
  ring.style.left = `${geometry.x}px`;
  ring.style.top = `${geometry.y}px`;
  ring.style.width = `${diameter}px`;
  ring.style.height = `${diameter}px`;
  ring.style.borderRadius = '9999px';
  ring.style.pointerEvents = 'none';
  ring.style.zIndex = '2147483647';
  ring.style.border = `1.5px solid ${edgeHighlight}`;
  ring.style.boxShadow = `0 0 42px 10px ${outerHalo}, inset 0 0 28px 6px ${outerHalo}`;
  ring.style.transform = 'translate3d(-50%, -50%, 0) scale(0)';
  ring.style.opacity = '0.85';
  ring.style.willChange = 'transform, opacity';

  document.body.appendChild(ring);

  // Keep scale curve 1:1 with clipPath circle() easing so the luminous rim rides the wave edge smoothly
  const scaleAnim = ring.animate(
    [
      { transform: 'translate3d(-50%, -50%, 0) scale(0)' },
      { transform: 'translate3d(-50%, -50%, 0) scale(1)' },
    ],
    {
      duration: THEME_WAVE_DURATION_MS,
      easing: THEME_WAVE_EASING,
      fill: 'forwards',
    },
  );

  const fadeAnim = ring.animate(
    [
      { opacity: 0.85, offset: 0 },
      { opacity: 0.65, offset: 0.55 },
      { opacity: 0, offset: 1 },
    ],
    {
      duration: THEME_WAVE_DURATION_MS,
      easing: 'ease-out',
      fill: 'forwards',
    },
  );

  const cleanup = () => {
    ring.remove();
  };
  scaleAnim.onfinish = cleanup;
  scaleAnim.oncancel = cleanup;
  fadeAnim.oncancel = cleanup;
}

function runFallbackWaveTransition(
  geometry: WaveGeometry,
  nextMode: 'light' | 'dark',
  themePrefs: ThemePrefs,
  prefersDark: boolean,
  onCommitMode: (mode: 'light' | 'dark') => void,
): Promise<'light' | 'dark'> {
  return new Promise((resolve) => {
    const veil = document.createElement('div');
    veil.setAttribute('aria-hidden', 'true');
    const diameter = geometry.endRadius * 2;
    veil.style.position = 'fixed';
    veil.style.left = `${geometry.x}px`;
    veil.style.top = `${geometry.y}px`;
    veil.style.width = `${diameter}px`;
    veil.style.height = `${diameter}px`;
    veil.style.borderRadius = '9999px';
    veil.style.pointerEvents = 'none';
    veil.style.zIndex = '2147483646';
    veil.style.backgroundColor = nextMode === 'dark' ? '#0b0c12' : '#f4f5fb';
    veil.style.transform = 'translate3d(-50%, -50%, 0) scale(0)';
    veil.style.willChange = 'transform, opacity';

    document.body.appendChild(veil);
    spawnWavefrontRing(geometry, nextMode);

    const expand = veil.animate(
      [
        { transform: 'translate3d(-50%, -50%, 0) scale(0)', opacity: 0.96 },
        { transform: 'translate3d(-50%, -50%, 0) scale(1.02)', opacity: 1 },
      ],
      {
        duration: Math.round(THEME_WAVE_DURATION_MS * 0.68),
        easing: THEME_WAVE_EASING,
        fill: 'forwards',
      },
    );

    expand.onfinish = () => {
      flushSync(() => {
        onCommitMode(nextMode);
      });
      applyThemeToDocument(
        document.documentElement,
        { ...themePrefs, themeMode: nextMode },
        prefersDark,
      );
      const fadeOut = veil.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: 280, easing: THEME_WAVE_EASING, fill: 'forwards' },
      );
      fadeOut.onfinish = () => {
        veil.remove();
        resolve(nextMode);
      };
      fadeOut.oncancel = () => {
        veil.remove();
        resolve(nextMode);
      };
    };
    expand.oncancel = () => {
      veil.remove();
      resolve(nextMode);
    };
  });
}

export async function triggerThemeWaveTransition(params: {
  sourceEl: HTMLElement | null;
  themePrefs: ThemePrefs;
  onCommitMode: (mode: 'light' | 'dark') => void;
}): Promise<'light' | 'dark'> {
  if (activeWavePromise) {
    return activeWavePromise;
  }

  const run = async (): Promise<'light' | 'dark'> => {
    const { sourceEl, themePrefs, onCommitMode } = params;
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    const nextMode = getNextToggledThemeMode(themePrefs.themeMode, prefersDark);

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (typeof document === 'undefined' || prefersReducedMotion) {
      onCommitMode(nextMode);
      return nextMode;
    }

    const rect: WaveRect = sourceEl
      ? sourceEl.getBoundingClientRect()
      : {
          left: window.innerWidth - 56,
          top: 28,
          width: 44,
          height: 44,
        };
    const geometry = computeWaveGeometry(rect, {
      width: window.innerWidth,
      height: window.innerHeight,
    });

    const docWithVT = document as Document & {
      startViewTransition?: (cb: () => void) => {
        ready: Promise<void>;
        finished: Promise<void>;
      };
    };

    if (typeof docWithVT.startViewTransition !== 'function') {
      return runFallbackWaveTransition(
        geometry,
        nextMode,
        themePrefs,
        prefersDark,
        onCommitMode,
      );
    }

    const root = document.documentElement;
    root.classList.add('sx-theme-wave-active');

    try {
      const transition = docWithVT.startViewTransition(() => {
        flushSync(() => {
          onCommitMode(nextMode);
        });
        applyThemeToDocument(root, { ...themePrefs, themeMode: nextMode }, prefersDark);
      });

      await transition.ready;
      spawnWavefrontRing(geometry, nextMode);

      const clipAnim = root.animate(
        {
          clipPath: [
            `circle(0px at ${geometry.x}px ${geometry.y}px)`,
            `circle(${geometry.endRadius}px at ${geometry.x}px ${geometry.y}px)`,
          ],
        },
        {
          duration: THEME_WAVE_DURATION_MS,
          easing: THEME_WAVE_EASING,
          pseudoElement: '::view-transition-new(root)',
        },
      );

      await Promise.allSettled([clipAnim.finished, transition.finished]);
    } catch {
      onCommitMode(nextMode);
      applyThemeToDocument(root, { ...themePrefs, themeMode: nextMode }, prefersDark);
    } finally {
      root.classList.remove('sx-theme-wave-active');
    }

    return nextMode;
  };

  activeWavePromise = run().finally(() => {
    activeWavePromise = null;
  });

  return activeWavePromise;
}
