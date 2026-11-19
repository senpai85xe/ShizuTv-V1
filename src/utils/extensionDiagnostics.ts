import type { ExtensionMediaTab } from './extensionsManager';

export type CapabilityStatus =
  | 'verified'
  | 'partial'
  | 'unavailable'
  | 'untested'
  | 'unsupported';

export type DiagnosticOverallStatus = 'pass' | 'partial' | 'fail' | 'unsupported';

export interface ExtensionDiagnosticCapabilities {
  metadataSearch: CapabilityStatus;
  episodeOrChapterListing: CapabilityStatus;
  playbackOrReader: CapabilityStatus;
  overallCompatibility: 'compatible' | 'partial' | 'unsupported' | 'incompatible';
}

export interface ExtensionDiagnosticReport {
  sourceId: string;
  sourceName: string;
  status: DiagnosticOverallStatus;
  durationMs: number;
  summary: string;
  detail?: string;
  matchedMediaId?: string;
  matchedTitle?: string;
  sampleItems?: string[];
  capabilities: ExtensionDiagnosticCapabilities;
}

export type ExtensionDiagnoseMode = 'ping' | 'basic' | 'full';

/**
 * Enforces strict rule: green 'pass' is ONLY permitted when actual playback (Anime)
 * or real chapter pages (Manga) were verified against the target extension/bridge.
 * AniList/AniZip metadata lookup or HTTP ping alone can never return 'pass'.
 */
export function resolveDiagnosticOverallStatus(params: {
  mode: ExtensionDiagnoseMode;
  unsupportedReason?: string | null;
  searchMatched: boolean;
  listingAvailable: boolean;
  playbackOrPagesVerified: boolean;
  errorOccurred: boolean;
}): DiagnosticOverallStatus {
  if (params.unsupportedReason) {
    return 'unsupported';
  }
  if (params.mode === 'full') {
    if (params.playbackOrPagesVerified) {
      return 'pass';
    }
    if (params.searchMatched || params.listingAvailable) {
      return 'partial';
    }
    return 'fail';
  }
  if (params.errorOccurred) {
    return 'fail';
  }
  // Ping & Basic search only check reachability / site search without playback verification
  if (params.searchMatched) {
    return 'partial';
  }
  return params.mode === 'ping' ? 'partial' : 'fail';
}

export function buildCapabilitiesBreakdown(params: {
  mode: ExtensionDiagnoseMode;
  mediaTab: ExtensionMediaTab;
  unsupportedReason?: string | null;
  isMetadataCatalogOnly?: boolean;
  searchMatched: boolean;
  listingAvailable: boolean;
  playbackOrPagesVerified: boolean;
}): ExtensionDiagnosticCapabilities {
  if (params.unsupportedReason || params.mediaTab === 'NOVEL') {
    return {
      metadataSearch: params.isMetadataCatalogOnly ? 'verified' : 'unsupported',
      episodeOrChapterListing: 'unsupported',
      playbackOrReader: 'unsupported',
      overallCompatibility: 'unsupported',
    };
  }

  const metadataSearch: CapabilityStatus =
    params.mode === 'ping'
      ? 'untested'
      : params.searchMatched
        ? 'verified'
        : 'unavailable';

  const episodeOrChapterListing: CapabilityStatus =
    params.mode !== 'full'
      ? 'untested'
      : params.listingAvailable
        ? 'verified'
        : 'unavailable';

  const playbackOrReader: CapabilityStatus =
    params.mode !== 'full'
      ? 'untested'
      : params.playbackOrPagesVerified
        ? 'verified'
        : 'unavailable';

  const overallCompatibility: ExtensionDiagnosticCapabilities['overallCompatibility'] =
    params.playbackOrPagesVerified
      ? 'compatible'
      : params.searchMatched || params.listingAvailable
        ? 'partial'
        : params.mode === 'full'
          ? 'incompatible'
          : 'partial';

  return {
    metadataSearch,
    episodeOrChapterListing,
    playbackOrReader,
    overallCompatibility,
  };
}

export function formatCapabilityBadgeText(
  kind: 'search' | 'listing' | 'playback',
  status: CapabilityStatus,
  mediaTab: ExtensionMediaTab,
): string {
  const listingNoun = mediaTab === 'ANIME' ? 'Episodes' : 'Chapters';
  const playbackNoun = mediaTab === 'ANIME' ? 'Video Playback' : 'Reader Pages';
  const label =
    kind === 'search' ? 'Search' : kind === 'listing' ? listingNoun : playbackNoun;

  switch (status) {
    case 'verified':
      return `${label}: Ready`;
    case 'partial':
      return `${label}: Partial`;
    case 'unsupported':
      return `${label}: Unsupported`;
    case 'unavailable':
      return `${label}: Failed`;
    case 'untested':
    default:
      return `${label}: Not Tested`;
  }
}
