import React, { useEffect, useMemo, useState } from 'react';
import { Play, Search, X } from 'lucide-react';
import { UnifiedEpisode } from '../types/media';

interface PlayerEpisodeDrawerProps {
  open: boolean;
  episodes: UnifiedEpisode[];
  activeIndex: number;
  compact?: boolean;
  onSelectEpisode: (index: number) => void;
  onClose: () => void;
}

const POPUP_CHUNK_SIZE = 50;

export const PlayerEpisodeDrawer: React.FC<PlayerEpisodeDrawerProps> = ({
  open,
  episodes,
  activeIndex,
  compact = false,
  onSelectEpisode,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [chunkIndex, setChunkIndex] = useState(0);

  const chunks = useMemo(() => {
    if (episodes.length <= POPUP_CHUNK_SIZE) return [];
    const list: Array<{ start: number; end: number; label: string }> = [];
    for (let i = 0; i < episodes.length; i += POPUP_CHUNK_SIZE) {
      const startNum = episodes[i]?.number ?? i + 1;
      const endIdx = Math.min(episodes.length - 1, i + POPUP_CHUNK_SIZE - 1);
      const endNum = episodes[endIdx]?.number ?? endIdx + 1;
      list.push({ start: i, end: endIdx + 1, label: `${startNum}-${endNum}` });
    }
    return list;
  }, [episodes]);

  // Keep the popup chunk aligned with the currently playing episode when opened
  useEffect(() => {
    if (!open || chunks.length === 0) return;
    const nextChunk = Math.max(
      0,
      Math.min(chunks.length - 1, Math.floor(activeIndex / POPUP_CHUNK_SIZE)),
    );
    setChunkIndex(nextChunk);
  }, [open, activeIndex, chunks.length]);

  const visibleEpisodes = useMemo(() => {
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      return episodes.filter(
        (ep) => ep.title.toLowerCase().includes(q) || String(ep.number).includes(q),
      );
    }
    if (chunks.length > 0) {
      const chunk = chunks[chunkIndex] ?? chunks[0];
      return episodes.slice(chunk.start, chunk.end);
    }
    return episodes;
  }, [episodes, query, chunks, chunkIndex]);

  if (!open) return null;

  return (
    <div
      data-no-gesture="true"
      className="absolute inset-0 z-40 flex items-center justify-center sm:justify-end p-2 sm:p-4"
    >
      {/* Frosted Blur Backdrop */}
      <button
        type="button"
        aria-label="Close episode drawer"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="sx-backdrop-enter absolute inset-0 w-full h-full bg-black/45 backdrop-blur-md cursor-default"
      />

      {/* Floating Frosted Glass Popup Card fitted cleanly inside the Player */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Episode List"
        data-testid="player-episode-drawer"
        onClick={(e) => e.stopPropagation()}
        className={`sx-player-popover relative z-10 flex flex-col overflow-hidden bg-zinc-950/65 backdrop-blur-2xl backdrop-saturate-150 border border-white/20 ring-1 ring-inset ring-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.65)] text-white ${
          compact
            ? 'w-full h-full rounded-2xl'
            : 'w-full max-w-[360px] max-h-[min(78%,520px)] sm:mt-10 sm:mb-12 rounded-3xl'
        }`}
      >
        {/* Header + Search Row */}
        <div
          className={`flex items-center justify-between gap-2 border-b border-white/12 shrink-0 ${
            compact ? 'px-2.5 py-2' : 'px-4 py-3'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0 shrink-0">
            <span
              aria-hidden="true"
              className="w-2 h-2 rounded-full bg-[var(--sx-player-accent)] shrink-0"
            />
            <h3 className={`${compact ? 'text-[11px] sm:text-xs' : 'text-sm'} font-extrabold whitespace-nowrap`}>
              Episodes ({episodes.length})
            </h3>
          </div>

          <div className="flex items-center gap-1.5 flex-1 justify-end min-w-0 max-w-[54%] sm:max-w-[60%]">
            <div className="relative flex-1 min-w-[74px] max-w-[180px]">
              <Search className="w-3 h-3 text-white/55 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Jump ep..."
                aria-label="Jump to episode"
                className={`w-full pl-7 pr-2 rounded-full bg-white/12 border border-white/15 text-[11px] text-white placeholder:text-white/50 focus:outline-none focus:border-[var(--sx-player-accent)] ${
                  compact ? 'py-1' : 'py-1.5'
                }`}
              />
            </div>

            <button
              type="button"
              aria-label="Close episodes"
              onClick={onClose}
              className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Chunk Selector when > 50 episodes */}
        {chunks.length > 0 && !query.trim() && (
          <div
            className={`flex items-center gap-1.5 overflow-x-auto no-scrollbar border-b border-white/10 shrink-0 ${
              compact ? 'px-2.5 py-1.5' : 'px-3.5 py-2'
            }`}
          >
            {chunks.map((c, idx) => {
              const active = idx === chunkIndex;
              return (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => setChunkIndex(idx)}
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold whitespace-nowrap tabular-nums transition-colors ${
                    active
                      ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] shadow-sm'
                      : 'bg-white/10 text-white/75 hover:bg-white/20 hover:text-white'
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Episode Items */}
        <div
          className={`flex-1 overflow-y-auto ${
            compact
              ? 'p-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5 content-start'
              : 'p-3 space-y-1.5'
          }`}
        >
          {visibleEpisodes.length === 0 ? (
            <p className="col-span-full py-6 text-center text-xs text-white/60 font-semibold">
              No episodes match &ldquo;{query}&rdquo;
            </p>
          ) : (
            visibleEpisodes.map((ep) => {
              const realIdx = episodes.findIndex((item) => item.id === ep.id);
              const isActive = realIdx === activeIndex;
              return (
                <button
                  key={ep.id}
                  type="button"
                  data-testid={`drawer-ep-${ep.number}`}
                  onClick={() => {
                    onSelectEpisode(realIdx >= 0 ? realIdx : 0);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between gap-2 rounded-xl text-left transition-all border ${
                    compact ? 'px-2.5 py-1.5' : 'px-3 py-2.5'
                  } ${
                    isActive
                      ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] border-transparent shadow-md font-extrabold'
                      : 'bg-white/8 hover:bg-white/16 border-white/10 text-white/90'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-mono-tabular font-black shrink-0 opacity-90">
                      {ep.number}
                    </span>
                    <span className="text-[11px] font-semibold truncate">{ep.title}</span>
                  </div>
                  {isActive && <Play className="w-3 h-3 fill-current shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
