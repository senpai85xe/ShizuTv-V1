import React from 'react';
import { BookOpen, Clock, Download, Play } from 'lucide-react';
import { EpisodeChapterStyle } from '../data/themePresets';
import { useApp } from '../store/AppContext';
import {
  getEpisodeChapterContainerClass,
  resolveEpisodeChapterStyle,
} from '../utils/episodeChapterStyle';
import { SmartImage } from './SmartImage';
import { getBoundedStaggerDelay } from '../utils/appMotion';

export interface EpisodeChapterListItem {
  id: string;
  number: number;
  title: string;
  meta: string;
  thumbnail?: string | null;
  isFiller?: boolean;
  isCurrent?: boolean;
  isNew?: boolean;
}

interface EpisodeChapterListProps {
  items: EpisodeChapterListItem[];
  unitLabel: 'EPISODE' | 'CHAPTER';
  style?: EpisodeChapterStyle;
  isManga?: boolean;
  previewMode?: boolean;
  translucent?: boolean;
  onSelectItem: (item: EpisodeChapterListItem, index: number) => void;
  onDownloadItem?: (item: EpisodeChapterListItem, index: number) => void;
}

export const EpisodeChapterList: React.FC<EpisodeChapterListProps> = ({
  items,
  unitLabel,
  style: styleOverride,
  isManga = false,
  previewMode = false,
  translucent = false,
  onSelectItem,
  onDownloadItem,
}) => {
  const { state } = useApp();
  const activeStyle = resolveEpisodeChapterStyle(
    styleOverride ?? state.uiPrefs.episodeChapterStyle,
  );
  const containerClass = getEpisodeChapterContainerClass(activeStyle, previewMode);
  const ActionIcon = isManga ? BookOpen : Play;
  const frostedCardSurface = translucent
    ? 'bg-[var(--sx-surface-container)]/30 dark:bg-[var(--sx-surface-container)]/34 backdrop-blur-lg backdrop-saturate-150 border-white/40 dark:border-white/12 shadow-[0_6px_24px_rgba(15,23,42,0.06)] ring-1 ring-inset ring-white/20 dark:ring-white/5'
    : 'bg-[var(--sx-surface-container)] border-[var(--sx-outline)]';

  if (activeStyle === 'classic') {
    return (
      <div data-testid="episode-list-classic" className={containerClass}>
        {items.map((item, idx) => (
          <div
            key={item.id}
            style={
              !previewMode
                ? { animationDelay: `${getBoundedStaggerDelay(idx, 18, 10)}ms` }
                : undefined
            }
            className={`group relative flex items-center justify-between gap-2 overflow-hidden rounded-[var(--sx-radius)] ${frostedCardSurface} border transition-all ${
              item.isCurrent
                ? 'border-[var(--sx-primary)]/75 ring-1 ring-inset ring-[var(--sx-primary)]/25'
                : 'hover:border-[var(--sx-primary)]/60'
            } ${!previewMode ? 'sx-card-animate' : ''}`}
          >
            {item.thumbnail && (
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <SmartImage
                  src={item.thumbnail}
                  alt=""
                  fallbackTitle={item.title}
                  fit="contain"
                  objectPosition="right"
                  transparentBg
                  shrinkToImage
                  imgMask="linear-gradient(to right, transparent 0%, rgba(0,0,0,0.35) 28%, rgba(0,0,0,0.88) 64%, black 100%)"
                  className="w-full h-full opacity-45 group-hover:opacity-60 group-hover:scale-[1.03] transition-all duration-300"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => onSelectItem(item, idx)}
              className="relative z-10 flex-1 flex items-center gap-3 px-3.5 py-2.5 text-left min-w-0 focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
            >
              <div className="flex flex-col items-center shrink-0">
                <span aria-hidden="true" className="w-[1.5px] h-2 bg-[var(--sx-outline)]" />
                <span
                  className={`my-0.5 w-7 h-7 rounded-full flex items-center justify-center transition-transform group-hover:scale-105 ${
                    item.isCurrent
                      ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                      : 'bg-[var(--sx-on-surface)] text-[var(--sx-surface)]'
                  }`}
                >
                  <ActionIcon className={`w-3.5 h-3.5 ${isManga ? '' : 'fill-current ml-0.5'}`} />
                </span>
                <span aria-hidden="true" className="w-[1.5px] h-2 bg-[var(--sx-outline)]" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
                    {unitLabel} {item.number}
                  </span>
                  {item.isCurrent && (
                    <span className="px-1.5 py-0.5 rounded-full bg-[var(--sx-primary)]/15 text-[var(--sx-primary)] text-[9px] font-extrabold uppercase tracking-wider">
                      Playing
                    </span>
                  )}
                  {item.isFiller && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[9px] font-bold uppercase">
                      Filler
                    </span>
                  )}
                </div>
                <p className="text-sm font-bold text-[var(--sx-on-surface)] truncate group-hover:text-[var(--sx-primary)] transition-colors">
                  {item.title}
                </p>
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--sx-on-surface-muted)] truncate mt-0.5">
                  <Clock className="w-3 h-3 shrink-0" />
                  <span className="truncate">{item.meta}</span>
                </div>
              </div>
            </button>

            {onDownloadItem && (
              <button
                type="button"
                onClick={() => onDownloadItem(item, idx)}
                title={`Download ${unitLabel.toLowerCase()} ${item.number}`}
                aria-label={`Download ${unitLabel.toLowerCase()} ${item.number}`}
                className={`relative z-10 mr-3 p-2 rounded-lg transition-colors shrink-0 ${
                  translucent
                    ? 'bg-[var(--sx-on-surface)]/8 dark:bg-white/10 backdrop-blur-md border border-white/30 dark:border-white/12 hover:bg-[var(--sx-primary)] hover:text-[var(--sx-on-primary)]'
                    : 'bg-[var(--sx-surface-high)]/85 backdrop-blur-sm hover:bg-[var(--sx-primary)] hover:text-[var(--sx-on-primary)]'
                }`}
              >
                <Download className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (activeStyle === 'grid') {
    return (
      <div data-testid="episode-list-grid" className={containerClass}>
        {items.map((item, idx) => (
          <div
            key={item.id}
            style={
              !previewMode
                ? { animationDelay: `${getBoundedStaggerDelay(idx, 18, 10)}ms` }
                : undefined
            }
            className={`group relative aspect-[16/10] rounded-[var(--sx-radius)] overflow-hidden bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] hover:border-[var(--sx-primary)]/65 transition-all ${
              !previewMode ? 'sx-card-animate' : ''
            }`}
          >
            <button
              type="button"
              onClick={() => onSelectItem(item, idx)}
              className="w-full h-full text-left relative focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
            >
              <SmartImage
                src={item.thumbnail}
                alt={item.title}
                fallbackTitle={`${unitLabel} ${item.number}`}
                fit="contain"
                backdropFill
                className="w-full h-full group-hover:scale-[1.03] transition-transform duration-300"
              />
              <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-t from-black/90 via-black/35 to-black/15" />

              {item.isNew && (
                <span className="absolute top-2 left-2 z-[3] px-1.5 py-0.5 rounded bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-[9px] font-black uppercase tracking-wider shadow">
                  NEW
                </span>
              )}

              <div className="absolute bottom-2.5 inset-x-3 z-[3] text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-lg font-black text-white tabular-nums leading-none drop-shadow">
                    {item.number}
                  </span>
                  {item.isFiller && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/80 text-black text-[9px] font-extrabold uppercase">
                      Filler
                    </span>
                  )}
                </div>
                <p className="text-xs font-bold text-white truncate mt-1 drop-shadow">
                  {item.title}
                </p>
                <p className="text-[10px] text-white/75 truncate mt-0.5">{item.meta}</p>
              </div>
            </button>

            {onDownloadItem && (
              <div className="absolute top-2 right-2 z-20 inline-flex items-center p-1 rounded-full bg-black/55 backdrop-blur-md border border-white/15">
                <button
                  type="button"
                  onClick={() => onDownloadItem(item, idx)}
                  title={`Download ${unitLabel.toLowerCase()} ${item.number}`}
                  aria-label={`Download ${unitLabel.toLowerCase()} ${item.number}`}
                  className="p-1.5 rounded-full text-white hover:bg-[var(--sx-primary)] hover:text-[var(--sx-on-primary)] transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (activeStyle === 'box') {
    return (
      <div data-testid="episode-list-box" className={containerClass}>
        {items.map((item, idx) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectItem(item, idx)}
            aria-label={`${unitLabel} ${item.number}: ${item.title}`}
            style={
              !previewMode
                ? { animationDelay: `${getBoundedStaggerDelay(idx, 14, 12)}ms` }
                : undefined
            }
            className={`relative rounded-[var(--sx-radius)] border p-2.5 flex flex-col items-center justify-center text-center min-h-[58px] transition-all focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)] ${
              !previewMode ? 'sx-card-animate' : ''
            } ${
              item.isCurrent
                ? 'bg-[var(--sx-on-surface)] text-[var(--sx-surface)] border-[var(--sx-on-surface)] shadow-md'
                : `${frostedCardSurface} text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)]/65 hover:bg-[var(--sx-surface-high)]`
            }`}
          >
            {item.isFiller && (
              <span
                aria-hidden="true"
                className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-400"
              />
            )}
            <span className="text-sm sm:text-base font-extrabold tabular-nums leading-tight">
              {item.number}
            </span>
            <span className="text-[10px] opacity-70 truncate max-w-full mt-0.5">
              {item.meta.split('·')[0].trim()}
            </span>
          </button>
        ))}
      </div>
    );
  }

  if (activeStyle === 'compact') {
    return (
      <div data-testid="episode-list-compact" className={containerClass}>
        {items.map((item, idx) => (
          <div
            key={item.id}
            style={
              !previewMode
                ? { animationDelay: `${getBoundedStaggerDelay(idx, 16, 10)}ms` }
                : undefined
            }
            className={`group flex items-center justify-between gap-2 px-3.5 py-2.5 hover:bg-[var(--sx-surface-high)]/60 transition-colors ${
              !previewMode ? 'sx-card-animate' : ''
            }`}
          >
            <button
              type="button"
              onClick={() => onSelectItem(item, idx)}
              className="flex-1 flex items-center gap-3 text-left min-w-0 focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
            >
              <span
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs sm:text-sm font-extrabold tabular-nums shrink-0 ${
                  item.isCurrent
                    ? 'bg-[var(--sx-on-surface)] text-[var(--sx-surface)]'
                    : 'text-[var(--sx-on-surface)]'
                }`}
              >
                {item.number}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-bold text-[var(--sx-on-surface)] truncate group-hover:text-[var(--sx-primary)] transition-colors">
                    {item.title}
                  </p>
                  {item.isFiller && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[9px] font-bold uppercase shrink-0">
                      Filler
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[var(--sx-on-surface-muted)] truncate mt-0.5">
                  {item.meta}
                </p>
              </div>
            </button>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onSelectItem(item, idx)}
                aria-label={`${isManga ? 'Read' : 'Play'} ${unitLabel.toLowerCase()} ${item.number}`}
                className="p-1.5 rounded-full text-[var(--sx-on-surface-muted)] group-hover:text-[var(--sx-primary)] transition-colors"
              >
                <ActionIcon className={`w-3.5 h-3.5 ${isManga ? '' : 'fill-current'}`} />
              </button>
              {onDownloadItem && (
                <button
                  type="button"
                  onClick={() => onDownloadItem(item, idx)}
                  title={`Download ${unitLabel.toLowerCase()} ${item.number}`}
                  aria-label={`Download ${unitLabel.toLowerCase()} ${item.number}`}
                  className={`p-2 rounded-lg transition-colors ${
                    translucent
                      ? 'bg-[var(--sx-on-surface)]/8 dark:bg-white/10 backdrop-blur-md border border-white/30 dark:border-white/12 hover:bg-[var(--sx-primary)] hover:text-[var(--sx-on-primary)]'
                      : 'bg-[var(--sx-surface-high)] hover:bg-[var(--sx-primary)] hover:text-[var(--sx-on-primary)]'
                  }`}
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // 'cover' style — wide 16:9 thumbnail left + details right
  return (
    <div data-testid="episode-list-cover" className={containerClass}>
      {items.map((item, idx) => (
        <div
          key={item.id}
          style={
            !previewMode
              ? { animationDelay: `${getBoundedStaggerDelay(idx, 18, 10)}ms` }
              : undefined
          }
          className={`group flex items-center justify-between gap-3 p-2.5 rounded-[var(--sx-radius)] ${frostedCardSurface} border hover:border-[var(--sx-primary)]/60 transition-all ${
            !previewMode ? 'sx-card-animate' : ''
          }`}
        >
          <button
            type="button"
            onClick={() => onSelectItem(item, idx)}
            className="flex-1 flex items-center gap-3 text-left min-w-0 focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
          >
            <div className="relative w-28 sm:w-32 aspect-video rounded-xl overflow-hidden bg-[var(--sx-surface-high)] shrink-0">
              <SmartImage
                src={item.thumbnail}
                alt={item.title}
                fallbackTitle={`${unitLabel} ${item.number}`}
                fit="contain"
                backdropFill
                className="w-full h-full group-hover:scale-[1.03] transition-transform duration-300"
              />
              <span className="absolute inset-0 z-[2] flex items-center justify-center bg-black/20 group-hover:bg-black/35 transition-colors">
                <span className="w-7 h-7 rounded-full bg-black/65 backdrop-blur-sm text-white flex items-center justify-center">
                  <ActionIcon className={`w-3.5 h-3.5 ${isManga ? '' : 'fill-current ml-0.5'}`} />
                </span>
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
                  {unitLabel} {item.number}
                </span>
                {item.isFiller && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[9px] font-bold uppercase">
                    Filler
                  </span>
                )}
              </div>
              <p className="text-sm font-bold text-[var(--sx-on-surface)] line-clamp-1 mt-0.5 group-hover:text-[var(--sx-primary)] transition-colors">
                {item.title}
              </p>
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--sx-on-surface-muted)] truncate mt-0.5">
                <Clock className="w-3 h-3 shrink-0" />
                <span className="truncate">{item.meta}</span>
              </div>
            </div>
          </button>

          {onDownloadItem && (
            <button
              type="button"
              onClick={() => onDownloadItem(item, idx)}
              title={`Download ${unitLabel.toLowerCase()} ${item.number}`}
              aria-label={`Download ${unitLabel.toLowerCase()} ${item.number}`}
              className={`p-2 rounded-lg transition-colors shrink-0 mr-1 ${
                translucent
                  ? 'bg-[var(--sx-on-surface)]/8 dark:bg-white/10 backdrop-blur-md border border-white/30 dark:border-white/12 hover:bg-[var(--sx-primary)] hover:text-[var(--sx-on-primary)]'
                  : 'bg-[var(--sx-surface-high)] hover:bg-[var(--sx-primary)] hover:text-[var(--sx-on-primary)]'
              }`}
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
};
