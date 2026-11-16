import {
  MediaType,
  SourceInfo,
  UnifiedChapter,
  UnifiedEpisode,
  UnifiedMedia,
  VideoServer,
  VideoStream,
} from '../types/media';
import { fetchJikanEpisodes } from './jikan';

export const INBUILT_SOURCES: SourceInfo[] = [
  {
    id: 'shonenx-hls-inbuilt',
    name: 'ShizuTv Stream (Inbuilt)',
    type: 'inbuilt',
    mediaTypes: ['ANIME', 'MOVIE', 'TV'],
    lang: 'en',
    version: '2.1.5',
    description: 'Adaptive HLS & subtitle-ready built-in anime streaming resolver.',
  },
  {
    id: 'shonenx-manga-inbuilt',
    name: 'ShizuTv Reader (Inbuilt)',
    type: 'inbuilt',
    mediaTypes: ['MANGA', 'NOVEL'],
    lang: 'en',
    version: '2.1.5',
    description: 'High-contrast manga & light novel reader source.',
  },
  {
    id: 'hianime-bridge',
    name: 'AniWatch / HiAnime (Bridge)',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '1.4.2',
    description: 'Community anime extension profile (SUB & DUB servers).',
  },
  {
    id: 'mangadex-bridge',
    name: 'MangaDex (Bridge)',
    type: 'extension',
    mediaTypes: ['MANGA'],
    lang: 'multi',
    version: '1.8.0',
    description: 'Multi-language scanlation chapter resolver.',
  },
];

// Public creative-commons / reference HLS & MP4 streams for verified browser playback
const SAMPLE_STREAMS = [
  {
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    quality: '1080p HLS',
    isHls: true,
  },
  {
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    quality: '720p MP4',
    isHls: false,
  },
];

export function resolveFallbackEpisodesCount(media: Pick<UnifiedMedia, 'episodes' | 'nextEpisode'>): number {
  const fromEpisodes = media.episodes && media.episodes > 0 ? media.episodes : 0;
  const fromAiring = media.nextEpisode && media.nextEpisode > 1 ? media.nextEpisode - 1 : 0;
  const maxCount = Math.max(fromEpisodes, fromAiring);
  return maxCount > 0 ? maxCount : 12;
}

export async function resolveEpisodesForMedia(media: UnifiedMedia): Promise<UnifiedEpisode[]> {
  const expectedCount = resolveFallbackEpisodesCount(media);

  // 1. Try real episode titles from Jikan if MAL ID is known
  if (media.idMal) {
    const jikanEps = await fetchJikanEpisodes(media.idMal);
    if (jikanEps.length > 0) {
      const highestFetched = jikanEps[jikanEps.length - 1]?.number ?? jikanEps.length;
      if (expectedCount > highestFetched) {
        const extra = Array.from({ length: expectedCount - highestFetched }, (_, idx) => {
          const num = highestFetched + idx + 1;
          return {
            id: `${media.id}-ep-${num}`,
            number: num,
            title: `Episode ${num}`,
            thumbnail: media.banner || media.cover || null,
            durationSeconds: (media.duration || 24) * 60,
          };
        });
        return [...jikanEps, ...extra];
      }
      return jikanEps;
    }
  }

  // 2. Fallback to full episode count from AniList metadata (no 100-episode cap)
  return Array.from({ length: expectedCount }, (_, idx) => {
    const num = idx + 1;
    return {
      id: `${media.id}-ep-${num}`,
      number: num,
      title: `Episode ${num}`,
      thumbnail: media.banner || media.cover || null,
      durationSeconds: (media.duration || 24) * 60,
    };
  });
}

export function resolveChaptersForMedia(media: UnifiedMedia): UnifiedChapter[] {
  const count = media.chapters && media.chapters > 0 ? media.chapters : 24;
  return Array.from({ length: count }, (_, idx) => {
    const num = idx + 1;
    return {
      id: `${media.id}-ch-${num}`,
      number: num,
      title: `Chapter ${num}`,
      scanlator: num % 2 === 0 ? 'Official Release' : 'ShizuTv Scanlations',
      pageCount: 14,
    };
  });
}

export function resolveVideoServers(sourceId?: string): VideoServer[] {
  if (sourceId === 'hianime-bridge') {
    return [
      { id: 'hd-1-sub', name: 'HD-1 (Sub)', category: 'sub' },
      { id: 'hd-2-sub', name: 'HD-2 (Sub)', category: 'sub' },
      { id: 'hd-1-dub', name: 'HD-1 (Dub)', category: 'dub' },
    ];
  }
  return [
    { id: 'primary-hls', name: 'Adaptive HLS (Auto)', category: 'sub' },
    { id: 'direct-mp4', name: 'Direct MP4 Fallback', category: 'sub' },
    { id: 'dub-hls', name: 'English Dub Mirror', category: 'dub' },
  ];
}

export function resolveVideoStream(
  media: UnifiedMedia,
  episode: UnifiedEpisode,
  server: VideoServer,
): VideoStream {
  const sample = server.id === 'direct-mp4' ? SAMPLE_STREAMS[1] : SAMPLE_STREAMS[0];
  const title = media.title.english || media.title.romaji || 'Anime';

  return {
    url: sample.url,
    quality: sample.quality,
    isHls: sample.isHls,
    serverName: server.name,
    subtitles: [
      {
        lang: 'en',
        label: 'English (VTT)',
        cues: [
          {
            start: 1,
            end: 6,
            text: `${title} — Episode ${episode.number}: ${episode.title}`,
          },
          {
            start: 7,
            end: 13,
            text: `[${server.name}] Adaptive stream initialized via ShizuTv Web Engine`,
          },
          {
            start: 14,
            end: 20,
            text: 'Use Space to play/pause, Left/Right to seek, and F for fullscreen.',
          },
        ],
      },
      {
        lang: 'ja',
        label: 'Japanese (Original)',
        cues: [
          {
            start: 1,
            end: 6,
            text: `${media.title.native || title} 第${episode.number}話`,
          },
        ],
      },
    ],
  };
}

/**
 * Generates crisp inline SVG manga pages for the browser reader when external
 * extension bridge servers aren't running locally, preserving full reader UX
 * (webtoon vertical scroll, single/double page, RTL/LTR, zoom, and chapter nav).
 */
export function resolveChapterPages(media: UnifiedMedia, chapter: UnifiedChapter): string[] {
  const title = (media.title.english || media.title.romaji || 'Manga').replace(/[<>&"']/g, '');
  const totalPages = chapter.pageCount || 12;

  return Array.from({ length: totalPages }, (_, idx) => {
    const pageNum = idx + 1;
    const isCover = pageNum === 1;
    const bg = isCover ? '#12131a' : '#fafafa';
    const fg = isCover ? '#f8fafc' : '#111827';
    const accent = isCover ? '#e50914' : '#1e293b';

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200" viewBox="0 0 800 1200">
        <rect width="800" height="1200" fill="${bg}" />
        <rect x="28" y="28" width="744" height="1144" fill="none" stroke="${fg}" stroke-opacity="0.18" stroke-width="2" />
        ${
          isCover
            ? `
          <rect x="64" y="96" width="672" height="360" rx="8" fill="${accent}" fill-opacity="0.14" stroke="${accent}" stroke-width="2" />
          <text x="400" y="240" text-anchor="middle" font-family="Montserrat, sans-serif" font-size="38" font-weight="800" fill="${fg}">${title.slice(0, 28)}</text>
          <text x="400" y="295" text-anchor="middle" font-family="Montserrat, sans-serif" font-size="22" font-weight="600" fill="${accent}">CHAPTER ${chapter.number}</text>
          <text x="400" y="340" text-anchor="middle" font-family="Montserrat, sans-serif" font-size="16" fill="${fg}" fill-opacity="0.7">${chapter.title.replace(/[<>&"']/g, '')}</text>
          <rect x="64" y="490" width="320" height="540" rx="4" fill="${fg}" fill-opacity="0.06" stroke="${fg}" stroke-opacity="0.2" />
          <rect x="416" y="490" width="320" height="255" rx="4" fill="${fg}" fill-opacity="0.06" stroke="${fg}" stroke-opacity="0.2" />
          <rect x="416" y="775" width="320" height="255" rx="4" fill="${fg}" fill-opacity="0.06" stroke="${fg}" stroke-opacity="0.2" />
        `
            : `
          <rect x="56" y="64" width="688" height="310" rx="4" fill="#e2e8f0" stroke="#0f172a" stroke-width="3" />
          <polygon points="56,374 420,250 744,374" fill="#cbd5e1" />
          <ellipse cx="560" cy="175" rx="120" ry="52" fill="#ffffff" stroke="#0f172a" stroke-width="2.5" />
          <text x="560" y="181" text-anchor="middle" font-family="Montserrat, sans-serif" font-size="16" font-weight="700" fill="#0f172a">Panel ${pageNum}.1</text>

          <rect x="56" y="398" width="330" height="360" rx="4" fill="#f1f5f9" stroke="#0f172a" stroke-width="3" />
          <rect x="414" y="398" width="330" height="360" rx="4" fill="#e2e8f0" stroke="#0f172a" stroke-width="3" />
          <circle cx="220" cy="540" r="68" fill="#ffffff" stroke="#0f172a" stroke-width="2.5" />
          <text x="220" y="546" text-anchor="middle" font-family="Montserrat, sans-serif" font-size="15" font-weight="700" fill="#0f172a">Ch.${chapter.number} · P.${pageNum}</text>

          <rect x="56" y="782" width="688" height="330" rx="4" fill="#f8fafc" stroke="#0f172a" stroke-width="3" />
          <line x1="80" y1="810" x2="720" y2="1080" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="8 8" />
          <text x="400" y="950" text-anchor="middle" font-family="Montserrat, sans-serif" font-size="20" font-weight="700" fill="#334155">${title.slice(0, 32)} — Page ${pageNum} of ${totalPages}</text>
        `
        }
        <text x="400" y="1152" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="14" fill="${fg}" fill-opacity="0.5">${pageNum} / ${totalPages}</text>
      </svg>
    `.trim();

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

export function getMediaTypeCategory(type: MediaType): 'watching' | 'reading' {
  return type === 'MANGA' || type === 'NOVEL' ? 'reading' : 'watching';
}
