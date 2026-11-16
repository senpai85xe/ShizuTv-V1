export type NetworkIndicatorVariant = 'hidden' | 'offline' | 'reconnected';

export interface NetworkIndicatorState {
  visible: boolean;
  variant: NetworkIndicatorVariant;
  label: string;
  detail: string;
}

export function readNavigatorOnlineStatus(nav?: Pick<Navigator, 'onLine'> | null): boolean {
  if (!nav || typeof nav.onLine !== 'boolean') {
    return true;
  }
  return nav.onLine;
}

export function getOfflineIndicatorState(params: {
  isOnline: boolean;
  dismissedOffline: boolean;
  justReconnected: boolean;
}): NetworkIndicatorState {
  if (!params.isOnline) {
    if (params.dismissedOffline) {
      return {
        visible: false,
        variant: 'hidden',
        label: '',
        detail: '',
      };
    }
    return {
      visible: true,
      variant: 'offline',
      label: 'Offline mode',
      detail: 'No internet connection',
    };
  }

  if (params.justReconnected) {
    return {
      visible: true,
      variant: 'reconnected',
      label: 'Back online',
      detail: 'Connection restored',
    };
  }

  return {
    visible: false,
    variant: 'hidden',
    label: '',
    detail: '',
  };
}
