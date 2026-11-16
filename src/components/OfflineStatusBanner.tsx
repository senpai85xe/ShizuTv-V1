import React from 'react';
import { createPortal } from 'react-dom';
import { Wifi, WifiOff, X } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

export const OfflineStatusBanner: React.FC = () => {
  const { visible, variant, label, detail, dismiss } = useNetworkStatus();

  if (!visible || typeof document === 'undefined') {
    return null;
  }

  const isOffline = variant === 'offline';

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[4.75rem] md:bottom-5 landscape:bottom-4 z-40 flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        data-testid="offline-status-indicator"
        data-network-state={variant}
        className="sx-card-animate pointer-events-auto inline-flex max-w-full items-center gap-2.5 rounded-2xl border border-[var(--sx-outline)] bg-[var(--sx-surface-container)]/90 px-3.5 py-2 text-xs text-[var(--sx-on-surface)] shadow-[0_12px_32px_-10px_rgba(0,0,0,0.45)] backdrop-blur-xl"
      >
        <span
          aria-hidden="true"
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-xl ${
            isOffline
              ? 'bg-amber-500/15 text-amber-400'
              : 'bg-emerald-500/15 text-emerald-400'
          }`}
        >
          {isOffline ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
        </span>

        <div className="min-w-0 leading-tight">
          <span className="font-bold tracking-tight">{label}</span>
          <span className="mx-1.5 text-[var(--sx-on-surface-muted)]" aria-hidden="true">
            ·
          </span>
          <span className="text-[11px] font-medium text-[var(--sx-on-surface-muted)]">
            {detail}
          </span>
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss network status notice"
          className="ml-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[var(--sx-on-surface-muted)] transition-colors hover:bg-[var(--sx-surface-high)] hover:text-[var(--sx-on-surface)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>,
    document.body,
  );
};
