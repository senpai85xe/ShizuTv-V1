import { MediaType, SourceInfo } from '../types/media';

export function getSourceManagerBadge(
  source?: Pick<SourceInfo, 'id' | 'type' | 'description'> | null,
): string {
  if (!source) return 'Inbuilt';
  if (source.id.startsWith('ext-ay-')) return 'Aniyomi';
  if (source.id.startsWith('ext-my-')) return 'Mangayomi';
  if (source.id.startsWith('ext-cs-')) return 'CloudStream';
  if (source.type === 'inbuilt') return 'Inbuilt';
  return 'Extension';
}

export function filterAvailableSources(sources: SourceInfo[], query: string): SourceInfo[] {
  const clean = query.trim().toLowerCase();
  if (!clean) return sources;
  return sources.filter((src) => {
    const manager = getSourceManagerBadge(src).toLowerCase();
    return (
      src.name.toLowerCase().includes(clean) ||
      src.lang.toLowerCase().includes(clean) ||
      manager.includes(clean) ||
      src.type.toLowerCase().includes(clean) ||
      (src.baseUrl && src.baseUrl.toLowerCase().includes(clean)) ||
      (src.description && src.description.toLowerCase().includes(clean))
    );
  });
}

export function formatSourceAvailabilityLabel(params: {
  mediaType?: MediaType;
  resolving: boolean;
  resolvedCount: number;
  expectedCount?: number | null;
  status?: string | null;
  hasOverride?: boolean;
}): string {
  const { mediaType, resolving, resolvedCount, expectedCount, status, hasOverride } = params;
  const isManga = mediaType === 'MANGA' || mediaType === 'NOVEL';
  const unit = isManga ? 'chapter' : 'episode';

  if (resolving && resolvedCount === 0) {
    return `Checking ${unit} availability on source...`;
  }

  const count = resolvedCount > 0 ? resolvedCount : expectedCount && expectedCount > 0 ? expectedCount : 0;
  const parts: string[] = [];

  if (count > 0) {
    parts.push(`${count} ${count === 1 ? unit : `${unit}s`} available`);
  } else {
    parts.push(`0 ${unit}s found`);
  }

  if (status && status.trim()) {
    parts.push(status.replace(/_/g, ' '));
  }

  if (hasOverride) {
    parts.push('Custom title match');
  }

  return parts.join(' · ');
}
