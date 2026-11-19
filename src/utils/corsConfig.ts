export const DEFAULT_CAPACITOR_ALLOWED_ORIGINS = [
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
  'ionic://localhost',
] as const;

export function normalizeOriginEntry(raw: string | undefined | null): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '*') return null;
  try {
    const parsed = new URL(trimmed);
    if (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:' ||
      parsed.protocol === 'capacitor:' ||
      parsed.protocol === 'ionic:'
    ) {
      return parsed.origin.toLowerCase();
    }
    return null;
  } catch {
    return null;
  }
}

export function getAllowedCorsOrigins(options?: {
  appUrl?: string | null;
  extraOrigins?: string | null;
  port?: number;
}): Set<string> {
  const allowed = new Set<string>(DEFAULT_CAPACITOR_ALLOWED_ORIGINS);
  const port = options?.port ?? 3000;
  allowed.add(`http://localhost:${port}`);
  allowed.add(`http://127.0.0.1:${port}`);

  const appOrigin = normalizeOriginEntry(options?.appUrl);
  if (appOrigin) {
    allowed.add(appOrigin);
  }

  if (typeof options?.extraOrigins === 'string' && options.extraOrigins.trim()) {
    for (const part of options.extraOrigins.split(',')) {
      const normalized = normalizeOriginEntry(part);
      if (normalized) {
        allowed.add(normalized);
      }
    }
  }

  return allowed;
}

export function isAllowedCorsOrigin(
  originHeader: string | undefined | null,
  allowedOrigins: Set<string>,
): string | null {
  if (typeof originHeader !== 'string' || !originHeader.trim()) {
    return null;
  }
  const trimmed = originHeader.trim();
  const normalized = trimmed.toLowerCase();
  if (allowedOrigins.has(normalized)) {
    return trimmed;
  }
  return null;
}

export function buildApiCorsHeaders(
  originHeader: string | undefined | null,
  allowedOrigins: Set<string>,
): Record<string, string> {
  const matchedOrigin = isAllowedCorsOrigin(originHeader, allowedOrigins);
  if (!matchedOrigin) {
    return {};
  }
  return {
    'Access-Control-Allow-Origin': matchedOrigin,
    Vary: 'Origin',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Range',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
  };
}
