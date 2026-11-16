import {
  AdultContentMode,
  CalendarEntry,
  MediaType,
  SearchFormatFilter,
  SearchSort,
  SearchStatusFilter,
  TrackerCategory,
  TrackerType,
  UnifiedMedia,
} from '../types/media';
import {
  fetchAniListCategory,
  fetchAniListDetails,
  fetchAniListGenresAndTags,
  fetchAniListWeekSchedule,
  searchAniList,
} from './anilist';
import {
  fetchJikanCategory,
  fetchJikanDetails,
  fetchJikanWeekSchedule,
  searchJikan,
} from './jikan';
import { fetchKitsuCategory, fetchKitsuDetails, searchKitsu } from './kitsu';

export async function fetchDiscoveryCategory(
  tracker: Exclude<TrackerType, 'local'>,
  category: TrackerCategory,
  mediaType: MediaType,
  adultMode: AdultContentMode,
  page = 1,
): Promise<{ items: UnifiedMedia[]; hasNextPage: boolean }> {
  if (tracker === 'myanimelist') {
    return fetchJikanCategory(category, mediaType, page);
  }
  if (tracker === 'kitsu') {
    return fetchKitsuCategory(category, mediaType);
  }
  return fetchAniListCategory(category, mediaType, adultMode, page);
}

export async function searchDiscoveryMedia(
  tracker: Exclude<TrackerType, 'local'>,
  params: {
    query?: string;
    type: MediaType;
    page?: number;
    genres?: string[];
    tags?: string[];
    sort?: SearchSort;
    status?: SearchStatusFilter;
    format?: SearchFormatFilter;
    adultMode?: AdultContentMode;
  },
): Promise<{ items: UnifiedMedia[]; hasNextPage: boolean }> {
  if (tracker === 'myanimelist') {
    if (params.query?.trim()) {
      return searchJikan(params.query.trim(), params.type, params.page ?? 1);
    }
    return fetchJikanCategory('popular', params.type, params.page ?? 1);
  }
  if (tracker === 'kitsu') {
    if (params.query?.trim()) {
      return searchKitsu(params.query.trim(), params.type);
    }
    return fetchKitsuCategory('popular', params.type);
  }
  return searchAniList(params);
}

export async function fetchMediaDetails(
  id: string,
  type: MediaType,
  providerId?: string | null,
): Promise<UnifiedMedia> {
  if (providerId === 'myanimelist' || providerId === 'mal') {
    return fetchJikanDetails(id, type);
  }
  if (providerId === 'kitsu') {
    return fetchKitsuDetails(id, type);
  }
  return fetchAniListDetails(id, type);
}

export async function fetchDiscoveryGenresAndTags(): Promise<{
  genres: string[];
  tags: string[];
}> {
  try {
    return await fetchAniListGenresAndTags();
  } catch {
    return {
      genres: [
        'Action',
        'Adventure',
        'Comedy',
        'Drama',
        'Fantasy',
        'Horror',
        'Mystery',
        'Psychological',
        'Romance',
        'Sci-Fi',
        'Slice of Life',
        'Sports',
        'Supernatural',
        'Thriller',
      ],
      tags: ['Isekai', 'Shounen', 'Seinen', 'Mecha', 'School', 'Time Travel', 'Magic'],
    };
  }
}

export async function fetchCalendarSchedule(
  source: 'anilist' | 'myanimelist' | 'kitsu',
  weekStart: Date,
  adultMode: AdultContentMode,
): Promise<CalendarEntry[]> {
  if (source === 'myanimelist') {
    return fetchJikanWeekSchedule();
  }
  return fetchAniListWeekSchedule(weekStart, adultMode);
}
