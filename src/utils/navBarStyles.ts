import { NavBarStyle } from '../data/themePresets';

export interface NavBarStyleOption {
  id: NavBarStyle;
  label: string;
  desc: string;
}

export const NAV_BAR_STYLE_OPTIONS: NavBarStyleOption[] = [
  { id: 'classic', label: 'Classic', desc: 'Floating side rail & pill mobile bar' },
  { id: 'frosted', label: 'Frosted', desc: 'Translucent backdrop-blur glass rail' },
  { id: 'glassIcons', label: 'Glass Icons', desc: 'Blurred round capsule · Icons only' },
  { id: 'glassLabeled', label: 'Glass Labeled', desc: 'Blurred round capsule · Icon & name' },
  { id: 'docked', label: 'Docked', desc: 'Full-height anchored edge rail' },
  { id: 'material', label: 'Material', desc: 'Tonal pill indicators' },
  { id: 'minimal', label: 'Minimal', desc: 'Low-profile clean navigation' },
];

export function isGlassPillNavStyle(style: NavBarStyle): boolean {
  return style === 'glassIcons' || style === 'glassLabeled';
}

export function isIconOnlyNavStyle(style: NavBarStyle): boolean {
  return style === 'glassIcons';
}

export function shouldShowAllMobileNavLabels(style: NavBarStyle): boolean {
  return style === 'glassLabeled';
}

export function shouldShowActiveMobileNavLabel(style: NavBarStyle, active: boolean): boolean {
  if (style === 'glassIcons') return false;
  if (style === 'glassLabeled') return true;
  return active;
}

export function getNavBarStyleLabel(style: NavBarStyle): string {
  return NAV_BAR_STYLE_OPTIONS.find((opt) => opt.id === style)?.label ?? style;
}
