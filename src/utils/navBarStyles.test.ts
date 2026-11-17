import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getNavBarStyleLabel,
  isGlassPillNavStyle,
  isIconOnlyNavStyle,
  NAV_BAR_STYLE_OPTIONS,
  shouldShowActiveMobileNavLabel,
  shouldShowAllMobileNavLabels,
} from './navBarStyles';

test('NAV_BAR_STYLE_OPTIONS includes both glassIcons and glassLabeled presets', () => {
  const ids = NAV_BAR_STYLE_OPTIONS.map((o) => o.id);
  assert.ok(ids.includes('glassIcons'));
  assert.ok(ids.includes('glassLabeled'));
  assert.equal(NAV_BAR_STYLE_OPTIONS.length, 7);
});

test('isGlassPillNavStyle identifies only the new blurred round pill styles', () => {
  assert.equal(isGlassPillNavStyle('glassIcons'), true);
  assert.equal(isGlassPillNavStyle('glassLabeled'), true);
  assert.equal(isGlassPillNavStyle('frosted'), false);
  assert.equal(isGlassPillNavStyle('classic'), false);
  assert.equal(isGlassPillNavStyle('docked'), false);
});

test('icon-only vs labeled visibility rules behave as requested', () => {
  assert.equal(isIconOnlyNavStyle('glassIcons'), true);
  assert.equal(isIconOnlyNavStyle('glassLabeled'), false);
  assert.equal(shouldShowAllMobileNavLabels('glassLabeled'), true);
  assert.equal(shouldShowAllMobileNavLabels('glassIcons'), false);

  // glassIcons: never show text labels even when active
  assert.equal(shouldShowActiveMobileNavLabel('glassIcons', true), false);
  assert.equal(shouldShowActiveMobileNavLabel('glassIcons', false), false);

  // glassLabeled: always show text labels for both active and inactive items
  assert.equal(shouldShowActiveMobileNavLabel('glassLabeled', true), true);
  assert.equal(shouldShowActiveMobileNavLabel('glassLabeled', false), true);

  // existing styles keep active-only label on mobile
  assert.equal(shouldShowActiveMobileNavLabel('frosted', true), true);
  assert.equal(shouldShowActiveMobileNavLabel('frosted', false), false);
});

test('getNavBarStyleLabel returns readable names for all presets', () => {
  assert.equal(getNavBarStyleLabel('glassIcons'), 'Glass Icons');
  assert.equal(getNavBarStyleLabel('glassLabeled'), 'Glass Labeled');
  assert.equal(getNavBarStyleLabel('frosted'), 'Frosted');
});
