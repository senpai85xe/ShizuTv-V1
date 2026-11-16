import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWaveGeometry,
  getNextToggledThemeMode,
} from './themeWaveTransition';

test('getNextToggledThemeMode toggles light, dark, and system modes accurately', () => {
  assert.equal(getNextToggledThemeMode('light', false), 'dark');
  assert.equal(getNextToggledThemeMode('light', true), 'dark');
  assert.equal(getNextToggledThemeMode('dark', false), 'light');
  assert.equal(getNextToggledThemeMode('dark', true), 'light');
  assert.equal(getNextToggledThemeMode('system', false), 'dark');
  assert.equal(getNextToggledThemeMode('system', true), 'light');
});

test('computeWaveGeometry computes origin center and full-viewport covering radius', () => {
  const geo = computeWaveGeometry(
    { left: 1300, top: 20, width: 44, height: 44 },
    { width: 1440, height: 900 },
  );
  assert.equal(geo.x, 1322);
  assert.equal(geo.y, 42);
  // Distance to farthest corner (0, 900)
  const expected = Math.hypot(1322, 900 - 42);
  assert.ok(Math.abs(geo.endRadius - expected) < 0.001);
  assert.ok(geo.endRadius > 1500);
});
