import type { SourceInfo } from '../types/media';

export const APP_STATE_STORAGE_KEY = 'shizutv_state_v2';
export const LEGACY_STATE_STORAGE_KEY = 'shonenx_state_v2';
export const REPO_CATALOG_STORAGE_KEY = 'shizutv_repo_catalog_v1';

const RECENT_CACHE_PREFIX = 'shizutv_recent_entry_v1:';
const RECENT_CACHE_INDEX_KEY = 'shizutv_recent_cache_index_v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length?: number;
  key?(index: number): string | null;
}

export interface PersistResult {
  ok: boolean;
  evictedCacheEntries: number;
  compactedCatalog: boolean;
  error: string | null;
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch {
    // Restricted storage context
  }
  return null;
}

/**
 * Strips bulky or empty optional fields from catalog entries when storage space is tight,
 * preserving every required runtime field (id, name, type, mediaTypes, lang, version, repoUrl, baseUrl, pkg).
 */
export function compactRepoCatalogEntries(catalog: SourceInfo[]): SourceInfo[] {
  if (!Array.isArray(catalog)) return [];
  return catalog.map((src) => {
    const compacted: SourceInfo = {
      id: src.id,
      name: src.name,
      type: src.type,
      mediaTypes: Array.isArray(src.mediaTypes) && src.mediaTypes.length > 0 ? src.mediaTypes : ['ANIME'],
      lang: src.lang || 'en',
      version: src.version || '1.0.0',
    };
    if (src.repoUrl) compacted.repoUrl = src.repoUrl;
    if (src.baseUrl) compacted.baseUrl = src.baseUrl;
    if (src.pkg) compacted.pkg = src.pkg;
    if (src.isNsfw) compacted.isNsfw = true;
    return compacted;
  });
}

/**
 * Frees localStorage space occupied by disposable offline API cache entries (already backed by CacheStorage).
 */
export function evictDisposableCacheFromStorage(storage: StorageLike): number {
  let evicted = 0;
  try {
    const keysToRemove: string[] = [];
    if (typeof storage.length === 'number' && typeof storage.key === 'function') {
      for (let i = 0; i < storage.length; i += 1) {
        const k = storage.key(i);
        if (k && (k.startsWith(RECENT_CACHE_PREFIX) || k === RECENT_CACHE_INDEX_KEY)) {
          keysToRemove.push(k);
        }
      }
    } else {
      const indexRaw = storage.getItem(RECENT_CACHE_INDEX_KEY);
      if (indexRaw) {
        try {
          const parsed = JSON.parse(indexRaw) as Array<{ key?: string }>;
          if (Array.isArray(parsed)) {
            for (const entry of parsed) {
              if (entry?.key) keysToRemove.push(`${RECENT_CACHE_PREFIX}${entry.key}`);
            }
          }
        } catch {
          // Ignore malformed index
        }
        keysToRemove.push(RECENT_CACHE_INDEX_KEY);
      }
    }

    for (const k of keysToRemove) {
      storage.removeItem(k);
      evicted += 1;
    }
  } catch {
    // Best-effort cleanup
  }
  return evicted;
}

function writeKeyWithQuotaRecovery(
  storage: StorageLike,
  key: string,
  value: string,
): { ok: boolean; evictedCacheEntries: number; error: string | null } {
  try {
    storage.setItem(key, value);
    return { ok: true, evictedCacheEntries: 0, error: null };
  } catch (firstErr) {
    const evicted = evictDisposableCacheFromStorage(storage);
    if (evicted > 0) {
      try {
        storage.setItem(key, value);
        return { ok: true, evictedCacheEntries: evicted, error: null };
      } catch (retryErr) {
        return {
          ok: false,
          evictedCacheEntries: evicted,
          error: retryErr instanceof Error ? retryErr.message : String(retryErr),
        };
      }
    }
    return {
      ok: false,
      evictedCacheEntries: 0,
      error: firstErr instanceof Error ? firstErr.message : String(firstErr),
    };
  }
}

/**
 * Persists application state cleanly:
 * - Writes core state (repos, customSources, activeSources, library, prefs) to shizutv_state_v2
 *   without repoCatalog bloat so large extension manifests cannot break core/installed persistence.
 * - Writes repoCatalog separately to shizutv_repo_catalog_v1, compacting descriptions/icons if quota is tight.
 * - Never fails silently: returns explicit PersistResult with error details.
 */
export function persistStateAndCatalog(
  state: Record<string, unknown> & { repoCatalog?: SourceInfo[] },
  storageOverride?: StorageLike | null,
): PersistResult {
  const storage = storageOverride === undefined ? getDefaultStorage() : storageOverride;
  if (!storage) {
    return {
      ok: false,
      evictedCacheEntries: 0,
      compactedCatalog: false,
      error: 'Browser localStorage is unavailable in this environment.',
    };
  }

  const catalog = Array.isArray(state.repoCatalog) ? state.repoCatalog : [];
  const coreState = {
    ...state,
    // Keep core state lean; repoCatalog lives in REPO_CATALOG_STORAGE_KEY (migrated seamlessly on read)
    repoCatalog: [],
  };

  let totalEvicted = 0;
  let coreSerialized = '';
  try {
    coreSerialized = JSON.stringify(coreState);
  } catch (err) {
    return {
      ok: false,
      evictedCacheEntries: 0,
      compactedCatalog: false,
      error: err instanceof Error ? `Failed to serialize state: ${err.message}` : 'Failed to serialize state.',
    };
  }

  const coreWrite = writeKeyWithQuotaRecovery(storage, APP_STATE_STORAGE_KEY, coreSerialized);
  totalEvicted += coreWrite.evictedCacheEntries;
  if (!coreWrite.ok) {
    return {
      ok: false,
      evictedCacheEntries: totalEvicted,
      compactedCatalog: false,
      error: `Failed to save extension state: ${coreWrite.error || 'Storage quota exceeded'}`,
    };
  }

  if (catalog.length === 0) {
    try {
      storage.removeItem(REPO_CATALOG_STORAGE_KEY);
    } catch {
      // Ignore cleanup errors
    }
    return {
      ok: true,
      evictedCacheEntries: totalEvicted,
      compactedCatalog: false,
      error: null,
    };
  }

  const fullCatalogJson = JSON.stringify(catalog);
  const fullWrite = writeKeyWithQuotaRecovery(storage, REPO_CATALOG_STORAGE_KEY, fullCatalogJson);
  totalEvicted += fullWrite.evictedCacheEntries;
  if (fullWrite.ok) {
    return {
      ok: true,
      evictedCacheEntries: totalEvicted,
      compactedCatalog: false,
      error: null,
    };
  }

  // Retry repoCatalog with compact metadata (strips iconUrl/description strings to fit quota)
  const compacted = compactRepoCatalogEntries(catalog);
  const compactWrite = writeKeyWithQuotaRecovery(
    storage,
    REPO_CATALOG_STORAGE_KEY,
    JSON.stringify(compacted),
  );
  totalEvicted += compactWrite.evictedCacheEntries;
  if (compactWrite.ok) {
    return {
      ok: true,
      evictedCacheEntries: totalEvicted,
      compactedCatalog: true,
      error: null,
    };
  }

  return {
    ok: false,
    evictedCacheEntries: totalEvicted,
    compactedCatalog: true,
    error: `Repository catalog could not be fully saved to browser storage (${compactWrite.error || 'QuotaExceededError'}). Installed extensions remain saved.`,
  };
}

/**
 * Loads persisted repoCatalog, preferring dedicated REPO_CATALOG_STORAGE_KEY and
 * transparently falling back to any legacy inline array from shizutv_state_v2.
 */
export function loadPersistedRepoCatalog(
  legacyInlineCatalog: unknown,
  storageOverride?: StorageLike | null,
): SourceInfo[] {
  const storage = storageOverride === undefined ? getDefaultStorage() : storageOverride;
  if (storage) {
    try {
      const raw = storage.getItem(REPO_CATALOG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (item): item is SourceInfo =>
              Boolean(item && typeof item === 'object' && typeof item.id === 'string' && typeof item.name === 'string'),
          );
        }
      }
    } catch {
      // Fallback to legacy inline catalog
    }
  }
  return Array.isArray(legacyInlineCatalog)
    ? (legacyInlineCatalog.filter(
        (item): item is SourceInfo =>
          Boolean(item && typeof item === 'object' && typeof item.id === 'string' && typeof item.name === 'string'),
      ))
    : [];
}
