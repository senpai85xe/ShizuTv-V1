import test from 'node:test';
import assert from 'node:assert/strict';
import { getOfflineIndicatorState, readNavigatorOnlineStatus } from './networkStatus';

test('readNavigatorOnlineStatus defaults to true when navigator is unavailable', () => {
  assert.equal(readNavigatorOnlineStatus(undefined), true);
  assert.equal(readNavigatorOnlineStatus(null), true);
  assert.equal(readNavigatorOnlineStatus({ onLine: true }), true);
  assert.equal(readNavigatorOnlineStatus({ onLine: false }), false);
});

test('getOfflineIndicatorState returns hidden when online and not recently reconnected', () => {
  const state = getOfflineIndicatorState({
    isOnline: true,
    dismissedOffline: false,
    justReconnected: false,
  });
  assert.equal(state.visible, false);
  assert.equal(state.variant, 'hidden');
});

test('getOfflineIndicatorState displays subtle offline indicator when disconnected unless dismissed', () => {
  const offline = getOfflineIndicatorState({
    isOnline: false,
    dismissedOffline: false,
    justReconnected: false,
  });
  assert.equal(offline.visible, true);
  assert.equal(offline.variant, 'offline');
  assert.equal(offline.label, 'Offline mode');
  assert.equal(offline.detail, 'No internet connection');

  const dismissed = getOfflineIndicatorState({
    isOnline: false,
    dismissedOffline: true,
    justReconnected: false,
  });
  assert.equal(dismissed.visible, false);
  assert.equal(dismissed.variant, 'hidden');
});

test('getOfflineIndicatorState shows transient reconnected confirmation when connection returns', () => {
  const reconnected = getOfflineIndicatorState({
    isOnline: true,
    dismissedOffline: false,
    justReconnected: true,
  });
  assert.equal(reconnected.visible, true);
  assert.equal(reconnected.variant, 'reconnected');
  assert.equal(reconnected.label, 'Back online');
});
