import { useEffect, useRef, useState } from 'react';
import {
  getOfflineIndicatorState,
  NetworkIndicatorState,
  readNavigatorOnlineStatus,
} from '../utils/networkStatus';

const RECONNECTED_VISIBLE_MS = 2400;

export function useNetworkStatus(): NetworkIndicatorState & {
  isOnline: boolean;
  dismiss: () => void;
} {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? readNavigatorOnlineStatus(navigator) : true,
  );
  const [dismissedOffline, setDismissedOffline] = useState(false);
  const [justReconnected, setJustReconnected] = useState(false);
  const wasOfflineRef = useRef(!isOnline);
  const reconnectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const syncInitial = readNavigatorOnlineStatus(
      typeof navigator !== 'undefined' ? navigator : null,
    );
    setIsOnline(syncInitial);
    wasOfflineRef.current = !syncInitial;

    const handleOffline = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wasOfflineRef.current = true;
      setJustReconnected(false);
      setDismissedOffline(false);
      setIsOnline(false);
    };

    const handleOnline = () => {
      setIsOnline(true);
      setDismissedOffline(false);
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        setJustReconnected(true);
        if (reconnectTimerRef.current !== null) {
          window.clearTimeout(reconnectTimerRef.current);
        }
        reconnectTimerRef.current = window.setTimeout(() => {
          setJustReconnected(false);
          reconnectTimerRef.current = null;
        }, RECONNECTED_VISIBLE_MS);
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
    };
  }, []);

  const indicator = getOfflineIndicatorState({
    isOnline,
    dismissedOffline,
    justReconnected,
  });

  return {
    ...indicator,
    isOnline,
    dismiss: () => {
      if (!isOnline) {
        setDismissedOffline(true);
      } else {
        setJustReconnected(false);
      }
    },
  };
}
