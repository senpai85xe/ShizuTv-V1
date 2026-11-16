import {
  AdultContentMode,
  CalendarEntry,
  LibraryEntry,
  MediaCharacter,
  MediaType,
  SearchFormatFilter,
  SearchSort,
  SearchStatusFilter,
  TrackedStatus,
  TrackerCategory,
  TrackerProfile,
  UnifiedMedia,
} from '../types/media';

import { resolveWithRecentCache } from '../utils/recentContentCache';

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';

// In-memory cache matching ShonenX's CacheManager
const memoryCache = new Map<string, { expires: number; data: unknown }>();

async function gqlRequest<T>(
  query: string,
  variables: Record<string, unknown> = {},
  token?: string | null,
  cacheMinutes = 15,
): Promise<T> {
  const cacheKey = `${query.slice(0, 80)}:${JSON.stringify(variables)}:${token ? 'auth' : 'anon'}`;
  const now = Date.now();
  const cached = memoryCache.get(cacheKey);
  if (cached && cached.expires > now && !token) {
    return cached.data as T;
  }

  const executeFetch = async (): Promise<T> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`AniList API ${res.status}: ${errText || res.statusText}`);
    }

    const json = await res.json();
    if (json.errors && json.errors.length > 0) {
      throw new Error(json.errors[0].message || 'AniList GraphQL error');
    }

    return json.data as T;
  };

  if (!token && cacheMinutes > 0) {
    const data = await resolveWithRecentCache<T>({
      key: cacheKey,
      ttlMs: cacheMinutes * 60 * 1000,
      fetcher: executeFetch,
    });
    memoryCache.set(cacheKey, {
      expires: now + cacheMinutes * 60 * 1000,
      data,
    });
    return data;
  }

  return executeFetch();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapAniListMedia(m: any): UnifiedMedia {
  const mediaType: MediaType = m.type === 'MANGA' ? 'MANGA' : 'ANIME';
  const airingAt = m.nextAiringEpisode?.airingAt
    ? new Date(m.nextAiringEpisode.airingAt * 1000).toISOString()
    : null;

  return {
    id: String(m.id),
    type: mediaType,
    providerId: 'anilist',
    idMal: m.idMal ? String(m.idMal) : null,
    externalIds: {
      anilist: String(m.id),
      ...(m.idMal ? { mal: String(m.idMal) } : {}),
    },
    title: {
      english: m.title?.english ?? null,
      romaji: m.title?.romaji ?? null,
      native: m.title?.native ?? null,
    },
    format: m.format ?? null,
    cover: m.coverImage?.extraLarge || m.coverImage?.large || null,
    banner: m.bannerImage || null,
    description: m.description ?? null,
    score: typeof m.averageScore === 'number' ? m.averageScore / 10 : null,
    genres: Array.isArray(m.genres) ? m.genres : [],
    tags: Array.isArray(m.tags)
      ? m.tags.map((t: { id: number; name: string; category?: string }) => ({
          id: String(t.id),
          name: t.name,
          category: t.category || 'General',
        }))
      : [],
    isAdult: m.isAdult ?? false,
    status: m.status ?? null,
    episodes: m.episodes ?? null,
    chapters: m.chapters ?? null,
    volumes: m.volumes ?? null,
    duration: m.duration ?? null,
    source: m.source ?? null,
    popularity: m.popularity ?? null,
    favourites: m.favourites ?? null,
    studios: Array.isArray(m.studios?.nodes)
      ? m.studios.nodes.map((s: { name: string }) => s.name)
      : [],
    synonyms: Array.isArray(m.synonyms) ? m.synonyms : [],
    season: m.season ?? null,
    year: m.seasonYear ?? m.startDate?.year ?? null,
    trailer:
      m.trailer?.site === 'youtube' && m.trailer?.id
        ? `https://www.youtube.com/watch?v=${m.trailer.id}`
        : null,
    airingAt,
    nextEpisode: m.nextAiringEpisode?.episode ?? null,
    externalLinks: Array.isArray(m.externalLinks)
      ? m.externalLinks.map((l: { id: number; url: string; site: string; icon?: string }) => ({
          id: String(l.id),
          url: l.url,
          site: l.site,
          icon: l.icon ?? null,
        }))
      : [],
    characters: Array.isArray(m.characters?.edges)
      ? m.characters.edges.map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (edge: any): MediaCharacter => ({
            id: String(edge.node?.id ?? ''),
            name: edge.node?.name?.full ?? 'Unknown',
            nativeName: edge.node?.name?.native ?? null,
            role: edge.role ?? null,
            image: edge.node?.image?.large ?? null,
            description: edge.node?.description ?? null,
            voiceActorName: edge.voiceActors?.[0]?.name?.full ?? null,
            voiceActorImage: edge.voiceActors?.[0]?.image?.large ?? null,
          }),
        )
      : [],
    relations: Array.isArray(m.relations?.edges)
      ? m.relations.edges
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((e: any) => e.node)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((e: any) => ({
            ...mapAniListMedia(e.node),
            relationType: e.relationType ?? null,
          }))
      : [],
    recommendations: Array.isArray(m.recommendations?.nodes)
      ? m.recommendations.nodes
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((n: any) => n.mediaRecommendation)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((n: any) => mapAniListMedia(n.mediaRecommendation))
      : [],
  };
}

function adultClause(mode: AdultContentMode): string {
  if (mode === 'safe') return ', isAdult: false';
  if (mode === 'adultOnly') return ', isAdult: true';
  return '';
}

function categoryToSort(category: TrackerCategory): string {
  switch (category) {
    case 'trending':
      return 'TRENDING_DESC';
    case 'popular':
      return 'POPULARITY_DESC';
    case 'topRated':
      return 'SCORE_DESC';
    case 'recentlyUpdated':
      return 'UPDATED_AT_DESC';
  }
}

export async function fetchAniListCategory(
  category: TrackerCategory,
  mediaType: MediaType,
  adultMode: AdultContentMode = 'safe',
  page = 1,
  perPage = 20,
): Promise<{ items: UnifiedMedia[]; hasNextPage: boolean }> {
  const gqlType = mediaType === 'MANGA' || mediaType === 'NOVEL' ? 'MANGA' : 'ANIME';
  const formatFilter = mediaType === 'NOVEL' ? ', format: NOVEL' : '';
  const sort = categoryToSort(category);

  const query = `
    query($page: Int, $perPage: Int, $type: MediaType, $sort: [MediaSort]) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { hasNextPage }
        media(type: $type, sort: $sort ${adultClause(adultMode)} ${formatFilter}) {
          id
          idMal
          type
          format
          title { english romaji native }
          coverImage { large extraLarge }
          bannerImage
          description(asHtml: false)
          status
          averageScore
          episodes
          chapters
          genres
          seasonYear
          season
          startDate { year }
          nextAiringEpisode { episode airingAt }
        }
      }
    }
  `;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await gqlRequest<any>(query, { page, perPage, type: gqlType, sort: [sort] });
  const list = data?.Page?.media ?? [];
  return {
    items: list.map(mapAniListMedia),
    hasNextPage: Boolean(data?.Page?.pageInfo?.hasNextPage),
  };
}

export interface AniListSearchParams {
  query?: string;
  type: MediaType;
  page?: number;
  perPage?: number;
  genres?: string[];
  tags?: string[];
  sort?: SearchSort;
  status?: SearchStatusFilter;
  format?: SearchFormatFilter;
  adultMode?: AdultContentMode;
}

export async function searchAniList(
  params: AniListSearchParams,
): Promise<{ items: UnifiedMedia[]; hasNextPage: boolean }> {
  const gqlType = params.type === 'MANGA' || params.type === 'NOVEL' ? 'MANGA' : 'ANIME';
  const adultMode = params.adultMode ?? 'safe';

  const query = `
    query(
      $search: String,
      $page: Int,
      $perPage: Int,
      $type: MediaType!,
      $genre_in: [String],
      $tag_in: [String],
      $status_in: [MediaStatus],
      $format_in: [MediaFormat],
      $sort: [MediaSort]
    ) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { hasNextPage }
        media(
          search: $search
          type: $type
          genre_in: $genre_in
          tag_in: $tag_in
          status_in: $status_in
          format_in: $format_in
          sort: $sort
          ${adultClause(adultMode)}
        ) {
          id
          idMal
          type
          format
          title { romaji english native }
          coverImage { large extraLarge }
          bannerImage
          description(asHtml: false)
          status
          averageScore
          episodes
          chapters
          genres
          seasonYear
          season
          startDate { year }
          nextAiringEpisode { episode airingAt }
        }
      }
    }
  `;

  const sortValue =
    params.query && (!params.sort || params.sort === 'POPULARITY_DESC')
      ? 'SEARCH_MATCH'
      : params.sort || 'POPULARITY_DESC';

  const variables: Record<string, unknown> = {
    page: params.page ?? 1,
    perPage: params.perPage ?? 24,
    type: gqlType,
    sort: [sortValue],
  };

  if (params.query?.trim()) variables.search = params.query.trim();
  if (params.genres && params.genres.length > 0) variables.genre_in = params.genres;
  if (params.tags && params.tags.length > 0) variables.tag_in = params.tags;
  if (params.status && params.status !== 'ALL') variables.status_in = [params.status];
  if (params.format && params.format !== 'ALL') variables.format_in = [params.format];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await gqlRequest<any>(query, variables, undefined, 10);
  const list = data?.Page?.media ?? [];
  return {
    items: list.map(mapAniListMedia),
    hasNextPage: Boolean(data?.Page?.pageInfo?.hasNextPage),
  };
}

export async function fetchAniListDetails(id: string, type: MediaType): Promise<UnifiedMedia> {
  const gqlType = type === 'MANGA' || type === 'NOVEL' ? 'MANGA' : 'ANIME';
  const query = `
    query($id: Int!, $type: MediaType!) {
      Media(id: $id, type: $type) {
        id
        idMal
        type
        title { romaji english native }
        synonyms
        format
        source
        duration
        chapters
        volumes
        popularity
        favourites
        coverImage { large extraLarge }
        nextAiringEpisode { episode airingAt }
        bannerImage
        description(asHtml: false)
        status
        averageScore
        episodes
        genres
        seasonYear
        season
        startDate { year }
        trailer { id site }
        tags { id name category }
        studios(isMain: true) { nodes { id name } }
        externalLinks { id url site icon }
        characters(perPage: 16, sort: [ROLE, RELEVANCE]) {
          edges {
            role
            node { id name { full native } image { large } description }
            voiceActors(language: JAPANESE, sort: [RELEVANCE]) {
              id
              name { full native }
              image { large }
            }
          }
        }
        relations {
          edges {
            relationType(version: 2)
            node {
              id type format
              title { romaji english native }
              coverImage { large }
              bannerImage status averageScore episodes chapters
            }
          }
        }
        recommendations(sort: RATING_DESC, perPage: 15) {
          nodes {
            mediaRecommendation {
              id type format
              title { romaji english native }
              coverImage { large }
              bannerImage status averageScore episodes chapters
            }
          }
        }
      }
    }
  `;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await gqlRequest<any>(query, { id: Number(id), type: gqlType }, undefined, 30);
  if (!data?.Media) throw new Error('Media not found on AniList');
  return mapAniListMedia(data.Media);
}

export async function fetchAniListGenresAndTags(): Promise<{ genres: string[]; tags: string[] }> {
  const query = `
    query {
      GenreCollection
      MediaTagCollection { name isAdult }
    }
  `;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await gqlRequest<any>(query, {}, undefined, 120);
  const genres: string[] = (data?.GenreCollection ?? []).filter((g: string) => g !== 'Hentai');
  const tags: string[] = (data?.MediaTagCollection ?? [])
    .filter((t: { isAdult?: boolean }) => !t.isAdult)
    .map((t: { name: string }) => t.name)
    .slice(0, 60);
  return { genres, tags };
}

export async function fetchAniListWeekSchedule(
  weekStart: Date,
  adultMode: AdultContentMode = 'safe',
): Promise<CalendarEntry[]> {
  const startSec = Math.floor(weekStart.getTime() / 1000);
  const endSec = startSec + 7 * 24 * 60 * 60 - 1;

  const query = `
    query($start: Int, $end: Int, $page: Int) {
      Page(page: $page, perPage: 50) {
        pageInfo { hasNextPage }
        airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
          id
          episode
          airingAt
          media {
            id
            idMal
            type
            format
            isAdult
            title { english romaji native }
            coverImage { large }
            bannerImage
            averageScore
            episodes
            genres
            status
          }
        }
      }
    }
  `;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await gqlRequest<any>(query, { start: startSec, end: endSec, page: 1 }, undefined, 10);
  const schedules = data?.Page?.airingSchedules ?? [];
  return schedules
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((s: any) => {
      if (!s.media) return false;
      if (adultMode === 'safe' && s.media.isAdult) return false;
      if (adultMode === 'adultOnly' && !s.media.isAdult) return false;
      return true;
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((s: any): CalendarEntry => ({
      id: String(s.id),
      episode: s.episode,
      airingAt: new Date(s.airingAt * 1000).toISOString(),
      media: mapAniListMedia(s.media),
    }));
}

export async function fetchAniListViewer(token: string): Promise<TrackerProfile> {
  const query = `
    query {
      Viewer {
        id
        name
        about
        siteUrl
        bannerImage
        avatar { large }
        statistics {
          anime { count episodesWatched meanScore }
          manga { count chaptersRead meanScore }
        }
      }
    }
  `;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await gqlRequest<any>(query, {}, token, 0);
  const v = data?.Viewer;
  if (!v) throw new Error('Invalid AniList token');
  return {
    tracker: 'anilist',
    id: String(v.id),
    username: v.name,
    avatarUrl: v.avatar?.large,
    bannerUrl: v.bannerImage,
    bio: v.about,
    siteUrl: v.siteUrl,
    animeCount: v.statistics?.anime?.count ?? 0,
    episodesWatched: v.statistics?.anime?.episodesWatched ?? 0,
    mangaCount: v.statistics?.manga?.count ?? 0,
    chaptersRead: v.statistics?.manga?.chaptersRead ?? 0,
    meanScore: v.statistics?.anime?.meanScore ?? 0,
  };
}

export async function fetchAniListUserLibrary(
  token: string,
  userId: string,
  mediaType: MediaType,
  status: TrackedStatus,
): Promise<LibraryEntry[]> {
  const gqlType = mediaType === 'MANGA' || mediaType === 'NOVEL' ? 'MANGA' : 'ANIME';
  const query = `
    query($userId: Int, $status: MediaListStatus, $type: MediaType) {
      Page(page: 1, perPage: 50) {
        mediaList(userId: $userId, status: $status, type: $type, sort: [UPDATED_TIME_DESC]) {
          progress
          score(format: POINT_10_DECIMAL)
          updatedAt
          notes
          media {
            id idMal type format
            title { english romaji native }
            coverImage { large }
            bannerImage
            description(asHtml: false)
            genres averageScore seasonYear status episodes chapters
          }
        }
      }
    }
  `;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await gqlRequest<any>(query, { userId: Number(userId), status, type: gqlType }, token, 0);
  const list = data?.Page?.mediaList ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return list.map((item: any): LibraryEntry => {
    const media = mapAniListMedia(item.media);
    return {
      mediaId: media.id,
      mediaType: media.type,
      media,
      status,
      progress: item.progress ?? 0,
      score: item.score ?? 0,
      notes: item.notes ?? '',
      updatedAt: item.updatedAt ? new Date(item.updatedAt * 1000).toISOString() : new Date().toISOString(),
      trackerType: 'anilist',
    };
  });
}

export async function saveAniListMediaEntry(
  token: string,
  mediaId: string,
  status: TrackedStatus,
  progress: number,
  score: number,
): Promise<void> {
  const mutation = `
    mutation($mediaId: Int, $status: MediaListStatus, $progress: Int, $scoreRaw: Int) {
      SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, scoreRaw: $scoreRaw) {
        id
      }
    }
  `;
  await gqlRequest(
    mutation,
    {
      mediaId: Number(mediaId),
      status,
      progress: Math.floor(progress),
      scoreRaw: Math.round(score * 10),
    },
    token,
    0,
  );
}
