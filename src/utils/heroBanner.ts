import { HomeSection, MediaType, UnifiedMedia } from '../types/media';
import type { HeroBannerStyle } from '../data/themePresets';

export type HomeMediaMode = 'ANIME' | 'MANGA';

const VALID_HERO_BANNER_STYLES: readonly HeroBannerStyle[] = [
  'classic',
  'coverflow',
  'cinematic',
  'splitPoster',
  'minimal',
];

export function resolveHeroBannerStyle(style?: string | null): HeroBannerStyle {
  if (style && VALID_HERO_BANNER_STYLES.includes(style as HeroBannerStyle)) {
    return style as HeroBannerStyle;
  }
  return 'classic';
}

export function formatHeroSlideCounter(activeIndex: number, total: number): string {
  if (total <= 0) return '00 / 00';
  const safeCurrent = Math.min(Math.max(activeIndex, 0), total - 1) + 1;
  return `${String(safeCurrent).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
}

export function wrapSlideIndex(current: number, delta: number, total: number): number {
  if (total <= 0) return 0;
  return ((current + delta) % total + total) % total;
}

export function stripHtmlTags(raw?: string | null): string {
  if (!raw) return '';
  return raw
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatHeroMetadata(media: UnifiedMedia): string[] {
  const parts: string[] = [];
  if (media.format) {
    parts.push(media.format);
  } else if (media.type) {
    parts.push(media.type);
  }
  if (media.year) {
    parts.push(String(media.year));
  }
  const genres = (media.genres || []).filter(Boolean).slice(0, 2);
  parts.push(...genres);
  return parts;
}

export function formatHeroScore(score?: number | null): string | null {
  if (typeof score !== 'number' || !Number.isFinite(score) || score <= 0) {
    return null;
  }
  return `${score.toFixed(1)}/10`;
}

export function getHeroCtaLabel(mediaType: MediaType): string {
  return mediaType === 'MANGA' || mediaType === 'NOVEL' ? 'Read now' : 'Watch now';
}

export function getHeroRankBadgeLabel(slideIndex: number, mediaType?: MediaType): string {
  const suffix = mediaType === 'MANGA' || mediaType === 'NOVEL' ? 'Manga' : 'Series';
  return `#${slideIndex + 1} in ${suffix}`;
}

export function filterHomeSectionsByMediaMode(
  sections: HomeSection[],
  mode: HomeMediaMode,
): HomeSection[] {
  return sections.filter((section) => {
    if (section.disabled) return false;
    const target = section.targetMediaType || 'ANIME';
    if (mode === 'MANGA') {
      return target === 'MANGA' || target === 'NOVEL';
    }
    return target === 'ANIME' || target === 'TV' || target === 'MOVIE';
  });
}

export function isTrendingDiscoveryRow(section: HomeSection): boolean {
  return section.type === 'discovery' && section.trackerCategory === 'trending';
}

export function selectHeroSlides(items: UnifiedMedia[], maxSlides = 5): UnifiedMedia[] {
  if (!items || items.length === 0) return [];
  const seen = new Set<string>();
  const picked: UnifiedMedia[] = [];

  for (const item of items) {
    if (seen.has(item.id)) continue;
    if (!item.banner && !item.cover) continue;
    seen.add(item.id);
    picked.push(item);
    if (picked.length >= maxSlides) break;
  }

  return picked;
}
