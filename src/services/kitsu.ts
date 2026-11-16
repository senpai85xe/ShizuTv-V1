import { MediaType, TrackerCategory, UnifiedMedia } from '../types/media';

const KITSU_BASE = 'https://kitsu.io/api/edge';
const cache = new Map<string, { expires: number; data: unknown }>();

async function kitsuGet<T>(path: string, ttlMin = 15): Promise<T> {
  const now = Date.now();
  const hit = cache.get(path);
  if (hit && hit.expires > now) return hit.data as T;

  const res = await fetch(`${KITSU_BASE}${path}`, {
    headers: { Accept: 'application/vnd.api+json' },
  });
  if (!res.ok) throw new Error(`Kitsu API ${res.status}: ${res.statusText}`);
  const json = await res.json();
  cache.set(path, { expires: now + ttlMin * 60 * 1000, data: json });
  return json as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapKitsuMedia(item: any, type: MediaType): UnifiedMedia {
  const attrs = item.attributes || {};
  return {
    id: String(item.id),
    providerId: 'kitsu',
    type,
    externalIds: { kitsu: String(item.id) },
    title: {
      english: attrs.titles?.en || attrs.titles?.en_us || attrs.canonicalTitle || null,
      romaji: attrs.titles?.en_jp || attrs.canonicalTitle || null,
      native: attrs.titles?.ja_jp || null,
    },
    format: attrs.subtype ? String(attrs.subtype).toUpperCase() : null,
    cover: attrs.posterImage?.large || attrs.posterImage?.medium || null,
    banner: attrs.coverImage?.large || attrs.coverImage?.original || null,
    description: attrs.synopsis || attrs.description || null,
    score: attrs.averageRating ? Number((Number(attrs.averageRating) / 10).toFixed(1)) : null,
    status: attrs.status ? String(attrs.status).toUpperCase() : null,
    episodes: attrs.episodeCount ?? null,
    chapters: attrs.chapterCount ?? null,
    volumes: attrs.volumeCount ?? null,
    year: attrs.startDate ? Number(String(attrs.startDate).slice(0, 4)) : null,
    genres: [],
  };
}

export async function fetchKitsuCategory(
  category: TrackerCategory,
  type: MediaType,
): Promise<{ items: UnifiedMedia[]; hasNextPage: boolean }> {
  const endpoint = type === 'MANGA' || type === 'NOVEL' ? 'manga' : 'anime';
  const path =
    category === 'trending'
      ? `/trending/${endpoint}?limit=20`
      : category === 'topRated'
        ? `/${endpoint}?sort=-averageRating&page[limit]=20`
        : category === 'recentlyUpdated'
          ? `/${endpoint}?sort=-updatedAt&page[limit]=20`
          : `/${endpoint}?sort=-userCount&page[limit]=20`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await kitsuGet<any>(path);
  return {
    items: (json.data ?? []).map((item: unknown) => mapKitsuMedia(item, type)),
    hasNextPage: Boolean(json.links?.next),
  };
}

export async function searchKitsu(
  query: string,
  type: MediaType,
): Promise<{ items: UnifiedMedia[]; hasNextPage: boolean }> {
  const endpoint = type === 'MANGA' || type === 'NOVEL' ? 'manga' : 'anime';
  const qs = new URLSearchParams({
    'filter[text]': query,
    'page[limit]': '20',
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await kitsuGet<any>(`/${endpoint}?${qs.toString()}`);
  return {
    items: (json.data ?? []).map((item: unknown) => mapKitsuMedia(item, type)),
    hasNextPage: Boolean(json.links?.next),
  };
}

export async function fetchKitsuDetails(id: string, type: MediaType): Promise<UnifiedMedia> {
  const endpoint = type === 'MANGA' || type === 'NOVEL' ? 'manga' : 'anime';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await kitsuGet<any>(`/${endpoint}/${id}`, 30);
  return mapKitsuMedia(json.data, type);
}
