import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBoundedStaggerDelay,
  getRouteTransitionClass,
  getRouteTransitionKind,
  isRectInRevealViewport,
  measureRelativePillRect,
} from './appMotion';

test('getRouteTransitionKind distinguishes tab switches, deeper pushes, and back pops', () => {
  assert.equal(getRouteTransitionKind(null, '/home'), 'none');
  assert.equal(getRouteTransitionKind('/home', '/home'), 'none');
  assert.equal(getRouteTransitionKind('/home', '/discover'), 'tab');
  assert.equal(getRouteTransitionKind('/library', '/settings'), 'tab');
  assert.equal(getRouteTransitionKind('/settings', '/settings/ui'), 'push');
  assert.equal(getRouteTransitionKind('/home', '/details/anime/21'), 'push');
  assert.equal(getRouteTransitionKind('/settings/ui', '/settings'), 'pop');
  assert.equal(getRouteTransitionKind('/details/anime/21', '/home'), 'pop');
});

test('getRouteTransitionClass maps each transition kind to its compositor CSS class', () => {
  assert.equal(getRouteTransitionClass('tab'), 'sx-page-tab-enter');
  assert.equal(getRouteTransitionClass('push'), 'sx-page-push-enter');
  assert.equal(getRouteTransitionClass('pop'), 'sx-page-pop-enter');
  assert.equal(getRouteTransitionClass('none'), '');
});

test('measureRelativePillRect computes container-relative coordinates accurately', () => {
  const rect = measureRelativePillRect(
    { left: 100, top: 40 },
    { left: 184, top: 44, width: 72, height: 36 },
  );
  assert.deepEqual(rect, {
    left: 84,
    top: 4,
    width: 72,
    height: 36,
    ready: true,
  });

  const empty = measureRelativePillRect(
    { left: 0, top: 0 },
    { left: 0, top: 0, width: 0, height: 0 },
  );
  assert.equal(empty.ready, false);
});

test('getBoundedStaggerDelay clamps step delays smoothly', () => {
  assert.equal(getBoundedStaggerDelay(0), 0);
  assert.equal(getBoundedStaggerDelay(3, 24, 10), 72);
  assert.equal(getBoundedStaggerDelay(25, 24, 10), 240);
});

test('isRectInRevealViewport distinguishes above/in-fold elements from below-fold sections', () => {
  assert.equal(isRectInRevealViewport(120, 420, 844), true);
  assert.equal(isRectInRevealViewport(860, 1180, 844, 40), true);
  assert.equal(isRectInRevealViewport(950, 1300, 844, 40), false);
  assert.equal(isRectInRevealViewport(-200, -60, 844, 40), false);
});
