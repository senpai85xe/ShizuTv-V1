import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Download,
  ExternalLink,
  MessageSquare,
  Play,
  BookOpen,
  Share2,
  Star,
  ThumbsUp,
  X,
  Check,
  Search,
  List,
  LayoutGrid,
  Hash,
  AlignJustify,
  RectangleHorizontal,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import {
  getPreferredTitle,
  getStatusLabel,
  MediaType,
  TrackedStatus,
  UnifiedChapter,
  UnifiedEpisode,
  UnifiedMedia,
} from '../types/media';
import { fetchMediaDetails } from '../services/discoveryService';
import {
  resolveChaptersForMedia,
  resolveEpisodesForMedia,
} from '../services/sourceEngine';
import { SmartImage } from '../components/SmartImage';
import { MediaCard } from '../components/MediaCard';
import { EpisodeChapterList } from '../components/EpisodeChapterList';
import { EPISODE_CHAPTER_STYLES, EpisodeChapterStyle } from '../data/themePresets';
import {
  formatChapterMetaLine,
  formatEpisodeMetaLine,
  getNextEpisodeChapterStyle,
  resolveEpisodeChapterStyle,
} from '../utils/episodeChapterStyle';
import { useSlidingPill } from '../hooks/useSlidingPill';

export const DetailsPage: React.FC = () => {
  const { mediaType: paramType, id } = useParams<{ mediaType: string; id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    state,
    updateUiPrefs,
    getLibraryEntry,
    upsertLibraryEntry,
    removeLibraryEntry,
    enqueueDownload,
    addComment,
    likeComment,
  } = useApp();

  const initialMedia = (location.state as { media?: UnifiedMedia } | null)?.media;
  const resolvedType: MediaType =
    paramType?.toUpperCase() === 'MANGA'
      ? 'MANGA'
      : paramType?.toUpperCase() === 'NOVEL'
        ? 'NOVEL'
        : 'ANIME';

  const [media, setMedia] = useState<UnifiedMedia>(
    initialMedia ?? {
      id: id || '',
      type: resolvedType,
      title: { english: 'Loading...' },
    },
  );
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [activeTab, setActiveTab] = useState<'about' | 'episodes'>('about');

  const [episodes, setEpisodes] = useState<UnifiedEpisode[]>([]);
  const [chapters, setChapters] = useState<UnifiedChapter[]>([]);
  const tabUnderlinePill = useSlidingPill<HTMLDivElement>(
    activeTab,
    `${episodes.length}-${chapters.length}`,
  );
  const [epFilter, setEpFilter] = useState('');
  const [epOrderAsc, setEpOrderAsc] = useState(true);

  const [trackerOpen, setTrackerOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [commentSpoiler, setCommentSpoiler] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);

  const libEntry = getLibraryEntry(media.id);
  const [editStatus, setEditStatus] = useState<TrackedStatus>(libEntry?.status || 'CURRENT');
  const [editProgress, setEditProgress] = useState<number>(libEntry?.progress || 0);
  const [editScore, setEditScore] = useState<number>(libEntry?.score || 0);
  const [editNotes, setEditNotes] = useState<string>(libEntry?.notes || '');

  useEffect(() => {
    if (libEntry) {
      setEditStatus(libEntry.status);
      setEditProgress(libEntry.progress);
      setEditScore(libEntry.score);
      setEditNotes(libEntry.notes || '');
    }
  }, [libEntry]);

  useEffect(() => {
    if (!id) return;
    setLoadingDetails(true);
    fetchMediaDetails(id, resolvedType, initialMedia?.providerId)
      .then(async (full) => {
        const merged = { ...initialMedia, ...full };
        setMedia(merged);
        if (merged.type === 'MANGA' || merged.type === 'NOVEL') {
          setChapters(resolveChaptersForMedia(merged));
        } else {
          const eps = await resolveEpisodesForMedia(merged);
          setEpisodes(eps);
        }
      })
      .catch(() => {
        // Keep partial media if available
      })
      .finally(() => setLoadingDetails(false));
  }, [id, resolvedType]);

  const title = getPreferredTitle(media.title, state.contentPrefs.titlePreference);
  const isManga = media.type === 'MANGA' || media.type === 'NOVEL';
  const comments = state.comments[media.id] || [];

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleSaveTracker = async () => {
    await upsertLibraryEntry(media, editStatus, editProgress, editScore, editNotes);
    setTrackerOpen(false);
  };

  const filteredEpisodes = (epOrderAsc ? episodes : [...episodes].reverse()).filter((ep) => {
    if (!epFilter.trim()) return true;
    const q = epFilter.toLowerCase();
    return ep.title.toLowerCase().includes(q) || String(ep.number).includes(q);
  });

  const filteredChapters = (epOrderAsc ? chapters : [...chapters].reverse()).filter((ch) => {
    if (!epFilter.trim()) return true;
    const q = epFilter.toLowerCase();
    return ch.title.toLowerCase().includes(q) || String(ch.number).includes(q);
  });

  return (
    <div className="min-h-screen pb-16">
      {/* Parallax Hero Header */}
      <div className="relative h-[340px] sm:h-[380px] w-full overflow-hidden">
        <SmartImage
          src={media.banner || media.cover}
          alt={title}
          className="absolute inset-0 w-full h-full"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--sx-surface)] via-[var(--sx-surface)]/75 to-black/40" />

        {/* Top Bar Actions */}
        <div className="relative z-20 flex items-center justify-between px-4 sm:px-6 pt-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2.5 rounded-xl bg-black/55 text-white backdrop-blur-md hover:bg-black/75 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              title="Copy Share Link"
              className="p-2.5 rounded-xl bg-black/55 text-white backdrop-blur-md hover:bg-black/75 transition-colors"
            >
              {copiedToast ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => setCommentsOpen(true)}
              title="Discussion"
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-black/55 text-white backdrop-blur-md hover:bg-black/75 text-xs font-bold"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="tabular-nums">{comments.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setTrackerOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-xs font-bold shadow-lg hover:opacity-90 transition-opacity"
            >
              {libEntry ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
              <span>
                {libEntry
                  ? `${isManga ? 'Ch' : 'Ep'} ${libEntry.progress} · ${getStatusLabel(libEntry.status, media.type)}`
                  : 'Add to Library'}
              </span>
            </button>
          </div>
        </div>

        {/* Cover & Title Lockup */}
        <div className="absolute inset-x-0 bottom-0 z-10 px-4 sm:px-8 pb-5 flex items-end gap-4 sm:gap-6">
          <div
            style={{ borderRadius: `${state.themePrefs.uiRoundness}px` }}
            className="w-28 sm:w-36 aspect-[2/3] overflow-hidden border border-[var(--sx-outline)] shadow-2xl shrink-0 bg-[var(--sx-surface-container)]"
          >
            <SmartImage src={media.cover} alt={title} fallbackTitle={title} className="w-full h-full" />
          </div>

          <div className="min-w-0 flex-1 space-y-2 pb-1">
            <h1 className="text-xl sm:text-3xl font-black tracking-tight text-[var(--sx-on-surface)] line-clamp-2">
              {title}
            </h1>
            {(media.title.native || media.title.romaji) && (
              <p className="text-xs sm:text-sm font-medium text-[var(--sx-on-surface-muted)] truncate">
                {media.title.native || media.title.romaji}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--sx-on-surface-muted)] tabular-nums">
              {media.score ? (
                <span className="inline-flex items-center gap-1 text-amber-400">
                  <Star className="w-3.5 h-3.5 fill-amber-400" />
                  {media.score.toFixed(1)}
                </span>
              ) : null}
              {media.format && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{media.format}</span>
                </>
              )}
              {media.status && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{media.status.replace(/_/g, ' ')}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>
                {isManga
                  ? `${media.chapters ?? '?'} chapters`
                  : `${media.episodes ?? '?'} episodes`}
              </span>
              {media.season && media.year && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    {media.season} {media.year}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Switcher matching DetailsScreen bottom TabBar */}
      <div className="sticky top-0 z-30 bg-[var(--sx-surface)]/90 backdrop-blur-xl border-b border-[var(--sx-outline)] px-4 sm:px-8 flex items-center justify-between">
        <div ref={tabUnderlinePill.containerRef} className="relative flex items-center gap-6">
          {tabUnderlinePill.pillRect.ready && (
            <span
              aria-hidden="true"
              style={{
                transform: `translate3d(${tabUnderlinePill.pillRect.left}px, 0, 0)`,
                width: `${tabUnderlinePill.pillRect.width}px`,
              }}
              className="sx-pill-glide pointer-events-none absolute left-0 bottom-0 h-[2.5px] rounded-full bg-[var(--sx-primary)]"
            />
          )}
          <button
            ref={tabUnderlinePill.registerItemRef('about')}
            type="button"
            onClick={() => setActiveTab('about')}
            className={`py-3.5 text-sm font-bold border-b-2 transition-colors ${
              activeTab === 'about'
                ? tabUnderlinePill.pillRect.ready
                  ? 'border-transparent text-[var(--sx-primary)]'
                  : 'border-[var(--sx-primary)] text-[var(--sx-primary)]'
                : 'border-transparent text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
            }`}
          >
            About
          </button>
          <button
            ref={tabUnderlinePill.registerItemRef('episodes')}
            type="button"
            onClick={() => setActiveTab('episodes')}
            className={`py-3.5 text-sm font-bold border-b-2 transition-colors ${
              activeTab === 'episodes'
                ? tabUnderlinePill.pillRect.ready
                  ? 'border-transparent text-[var(--sx-primary)]'
                  : 'border-[var(--sx-primary)] text-[var(--sx-primary)]'
                : 'border-transparent text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
            }`}
          >
            {isManga ? `Chapters (${chapters.length})` : `Episodes (${episodes.length})`}
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            if (isManga && chapters.length > 0) {
              navigate('/reader', { state: { media, chapters, chapterIndex: 0 } });
            } else if (!isManga && episodes.length > 0) {
              navigate('/player', { state: { media, episodes, episodeIndex: 0 } });
            } else {
              setActiveTab('episodes');
            }
          }}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-xs font-bold hover:opacity-90"
        >
          {isManga ? <BookOpen className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          <span>{isManga ? 'Start Reading' : 'Watch Episode 1'}</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="px-4 sm:px-8 pt-6 space-y-8 max-w-6xl">
        {activeTab === 'about' ? (
          <>
            {/* Synopsis */}
            <section className="space-y-2.5">
              <h2 className="text-base font-extrabold">Synopsis</h2>
              {loadingDetails && !media.description ? (
                <div className="space-y-2">
                  <div className="h-4 w-full bg-[var(--sx-surface-high)] rounded animate-pulse" />
                  <div className="h-4 w-5/6 bg-[var(--sx-surface-high)] rounded animate-pulse" />
                </div>
              ) : (
                <p className="text-sm leading-relaxed text-[var(--sx-on-surface-muted)] whitespace-pre-line">
                  {(media.description || 'No description available.')
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<[^>]+>/g, '')}
                </p>
              )}
            </section>

            {/* Genres & Studios */}
            {(media.genres?.length || media.studios?.length) ? (
              <section className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-4 rounded-[var(--sx-radius)] bg-[var(--sx-surface-container)] border border-[var(--sx-outline)]">
                {media.genres && media.genres.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-[var(--sx-on-surface-muted)]">Genres</h3>
                    <div className="flex flex-wrap gap-2">
                      {media.genres.map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => navigate(`/discover?type=${media.type}&genres=${encodeURIComponent(g)}`)}
                          className="text-xs font-bold text-[var(--sx-on-surface)] hover:text-[var(--sx-primary)] transition-colors"
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {media.studios && media.studios.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-[var(--sx-on-surface-muted)]">Studios</h3>
                    <p className="text-sm font-bold">{media.studios.join(' · ')}</p>
                  </div>
                )}
              </section>
            ) : null}

            {/* Characters */}
            {media.characters && media.characters.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-base font-extrabold">Characters</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {media.characters.slice(0, 9).map((char) => (
                    <div
                      key={char.id}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-[var(--sx-radius)] bg-[var(--sx-surface-container)] border border-[var(--sx-outline)]"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <SmartImage
                          src={char.image}
                          alt={char.name}
                          className="w-12 h-14 rounded-lg shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">{char.name}</p>
                          <p className="text-[11px] text-[var(--sx-on-surface-muted)]">
                            {char.role}
                          </p>
                        </div>
                      </div>
                      {char.voiceActorName && (
                        <div className="flex items-center gap-2 text-right min-w-0">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold truncate">{char.voiceActorName}</p>
                            <p className="text-[10px] text-[var(--sx-on-surface-muted)]">JP VA</p>
                          </div>
                          <SmartImage
                            src={char.voiceActorImage}
                            alt={char.voiceActorName}
                            className="w-10 h-12 rounded-lg shrink-0"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* External Links */}
            {media.externalLinks && media.externalLinks.length > 0 && (
              <section className="space-y-2.5">
                <h2 className="text-base font-extrabold">External Links</h2>
                <div className="flex flex-wrap gap-2">
                  {media.externalLinks.map((link) => (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] text-xs font-bold hover:border-[var(--sx-primary)] transition-colors"
                    >
                      <span>{link.site}</span>
                      <ExternalLink className="w-3 h-3 text-[var(--sx-on-surface-muted)]" />
                    </a>
                  ))}
                </div>
              </section>
            )}

            {/* Relations */}
            {media.relations && media.relations.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-base font-extrabold">Relations</h2>
                <div className="flex gap-3.5 overflow-x-auto no-scrollbar pb-2">
                  {media.relations.map((rel) => (
                    <MediaCard
                      key={`rel-${rel.id}`}
                      media={rel}
                      progressLabel={rel.relationType?.replace(/_/g, ' ') || undefined}
                      onClick={() =>
                        navigate(`/details/${rel.type.toLowerCase()}/${rel.id}`, {
                          state: { media: rel },
                        })
                      }
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Recommendations */}
            {media.recommendations && media.recommendations.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-base font-extrabold">Recommendations</h2>
                <div className="flex gap-3.5 overflow-x-auto no-scrollbar pb-2">
                  {media.recommendations.map((rec) => (
                    <MediaCard
                      key={`rec-${rec.id}`}
                      media={rec}
                      onClick={() =>
                        navigate(`/details/${rec.type.toLowerCase()}/${rec.id}`, {
                          state: { media: rec },
                        })
                      }
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          /* Episodes / Chapters Tab */
          <section className="space-y-4">
            {(() => {
              const activeEpStyle = resolveEpisodeChapterStyle(
                state.uiPrefs.episodeChapterStyle,
              );
              const styleDef =
                EPISODE_CHAPTER_STYLES.find((s) => s.id === activeEpStyle) ??
                EPISODE_CHAPTER_STYLES[0];
              const styleIconMap: Record<
                EpisodeChapterStyle,
                React.FC<{ className?: string }>
              > = {
                classic: List,
                grid: LayoutGrid,
                box: Hash,
                compact: AlignJustify,
                cover: RectangleHorizontal,
              };
              const StyleIcon = styleIconMap[activeEpStyle];

              const listItems = isManga
                ? filteredChapters.map((ch) => ({
                    id: ch.id,
                    number: ch.number,
                    title: ch.title,
                    meta: formatChapterMetaLine(ch),
                    thumbnail: media.banner || media.cover || null,
                    isCurrent: (libEntry?.progress ?? 0) + 1 === ch.number,
                  }))
                : filteredEpisodes.map((ep) => ({
                    id: ep.id,
                    number: ep.number,
                    title: ep.title,
                    meta: formatEpisodeMetaLine(ep),
                    thumbnail: ep.thumbnail || media.banner || media.cover || null,
                    isFiller: ep.isFiller,
                    isCurrent: (libEntry?.progress ?? 0) + 1 === ep.number,
                  }));

              return (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                      <Search className="w-4 h-4 text-[var(--sx-on-surface-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={epFilter}
                        onChange={(e) => setEpFilter(e.target.value)}
                        placeholder={isManga ? 'Filter chapters...' : 'Filter episodes...'}
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] text-xs font-medium focus:outline-none focus:border-[var(--sx-primary)]"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        data-testid="details-episode-style-toggle"
                        onClick={() =>
                          updateUiPrefs({
                            episodeChapterStyle: getNextEpisodeChapterStyle(activeEpStyle),
                          })
                        }
                        title={`Switch layout (current: ${styleDef.name})`}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] text-xs font-bold hover:border-[var(--sx-primary)] transition-colors"
                      >
                        <StyleIcon className="w-3.5 h-3.5 text-[var(--sx-primary)]" />
                        <span>{styleDef.name}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEpOrderAsc((v) => !v)}
                        className="px-3 py-2 rounded-xl bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] text-xs font-bold hover:border-[var(--sx-primary)]"
                      >
                        Order: {epOrderAsc ? 'Ascending' : 'Descending'}
                      </button>
                    </div>
                  </div>

                  <EpisodeChapterList
                    items={listItems}
                    unitLabel={isManga ? 'CHAPTER' : 'EPISODE'}
                    style={activeEpStyle}
                    isManga={isManga}
                    onSelectItem={(item) => {
                      if (isManga) {
                        const realIndex = chapters.findIndex((c) => c.id === item.id);
                        navigate('/reader', {
                          state: { media, chapters, chapterIndex: realIndex },
                        });
                      } else {
                        const realIndex = episodes.findIndex((e) => e.id === item.id);
                        navigate('/player', {
                          state: { media, episodes, episodeIndex: realIndex },
                        });
                      }
                    }}
                    onDownloadItem={(item) => {
                      if (isManga) {
                        enqueueDownload(media, item.number, item.title);
                      } else {
                        enqueueDownload(
                          media,
                          item.number,
                          item.title,
                          state.playerPrefs.defaultQuality,
                        );
                      }
                    }}
                  />
                </>
              );
            })()}
          </section>
        )}
      </div>

      {/* Edit Tracker / Library Modal */}
      {trackerOpen &&
        (() => {
          const modalContent = (
            <div
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4 sx-backdrop-enter"
              onClick={() => setTrackerOpen(false)}
              role="dialog"
              aria-modal="true"
              aria-label="Update Library and Tracker"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full sm:max-w-md bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] rounded-t-2xl sm:rounded-2xl p-5 space-y-4 shadow-2xl sx-sheet-enter"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-extrabold">Update Library & Tracker</h2>
                  <button
                    type="button"
                    onClick={() => setTrackerOpen(false)}
                    className="p-2 rounded-lg hover:bg-[var(--sx-surface-high)]"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[var(--sx-on-surface-muted)]">
                      Status
                    </label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as TrackedStatus)}
                      className="w-full px-3 py-2.5 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-xs font-bold"
                    >
                      {(
                        [
                          'CURRENT',
                          'PLANNING',
                          'COMPLETED',
                          'PAUSED',
                          'DROPPED',
                          'REPEATING',
                        ] as TrackedStatus[]
                      ).map((s) => (
                        <option key={s} value={s}>
                          {getStatusLabel(s, media.type)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[var(--sx-on-surface-muted)]">
                        {isManga ? 'Chapters Read' : 'Episodes Watched'}
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditProgress((p) => Math.max(0, p - 1))}
                          className="px-3 py-2 rounded-xl bg-[var(--sx-surface-high)] font-bold"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={editProgress}
                          onChange={(e) => setEditProgress(Math.max(0, Number(e.target.value)))}
                          className="w-full px-3 py-2 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-center text-xs font-bold tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() => setEditProgress((p) => p + 1)}
                          className="px-3 py-2 rounded-xl bg-[var(--sx-surface-high)] font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[var(--sx-on-surface-muted)]">
                        Score (0 - 10)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        step={0.5}
                        value={editScore}
                        onChange={(e) =>
                          setEditScore(Math.min(10, Math.max(0, Number(e.target.value))))
                        }
                        className="w-full px-3 py-2 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-xs font-bold tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[var(--sx-on-surface-muted)]">
                      Notes
                    </label>
                    <textarea
                      rows={2}
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Personal notes..."
                      className="w-full px-3 py-2 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-xs"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[var(--sx-outline)]">
                  {libEntry ? (
                    <button
                      type="button"
                      onClick={() => {
                        removeLibraryEntry(media.id);
                        setTrackerOpen(false);
                      }}
                      className="text-xs font-bold text-red-400 hover:underline"
                    >
                      Remove
                    </button>
                  ) : (
                    <div />
                  )}
                  <button
                    type="button"
                    onClick={handleSaveTracker}
                    className="px-5 py-2.5 rounded-xl bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-xs font-bold"
                  >
                    Save Progress
                  </button>
                </div>
              </div>
            </div>
          );
          return typeof document !== 'undefined'
            ? createPortal(modalContent, document.body)
            : modalContent;
        })()}

      {/* Comments Sheet Modal */}
      {commentsOpen &&
        (() => {
          const modalContent = (
            <div
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4 sx-backdrop-enter"
              onClick={() => setCommentsOpen(false)}
              role="dialog"
              aria-modal="true"
              aria-label="Discussion"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full sm:max-w-lg max-h-[80vh] flex flex-col bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl sx-sheet-enter"
              >
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--sx-outline)]">
                  <h2 className="text-base font-extrabold">Discussion ({comments.length})</h2>
                  <button
                    type="button"
                    onClick={() => setCommentsOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-[var(--sx-surface-high)]"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                  {comments.length === 0 ? (
                    <p className="text-xs text-[var(--sx-on-surface-muted)] text-center py-8">
                      No comments yet. Start the discussion below!
                    </p>
                  ) : (
                    comments.map((c) => (
                      <div
                        key={c.id}
                        className="p-3.5 rounded-xl bg-[var(--sx-surface-high)] space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold">{c.author}</span>
                          <span className="text-[11px] text-[var(--sx-on-surface-muted)]">
                            {new Date(c.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed">
                          {c.spoiler ? '[Spoiler] ' : ''}
                          {c.body}
                        </p>
                        <button
                          type="button"
                          onClick={() => likeComment(media.id, c.id)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-primary)]"
                        >
                          <ThumbsUp className="w-3 h-3" />
                          <span className="tabular-nums">{c.likes}</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addComment(media.id, commentInput, commentSpoiler);
                    setCommentInput('');
                  }}
                  className="p-4 border-t border-[var(--sx-outline)] space-y-2 bg-[var(--sx-surface-container)]"
                >
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                      placeholder="Write a comment..."
                      className="flex-1 px-3 py-2 rounded-xl bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-xs focus:outline-none focus:border-[var(--sx-primary)]"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-xs font-bold"
                    >
                      Post
                    </button>
                  </div>
                  <label className="inline-flex items-center gap-2 text-[11px] text-[var(--sx-on-surface-muted)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={commentSpoiler}
                      onChange={(e) => setCommentSpoiler(e.target.checked)}
                    />
                    <span>Mark as spoiler</span>
                  </label>
                </form>
              </div>
            </div>
          );
          return typeof document !== 'undefined'
            ? createPortal(modalContent, document.body)
            : modalContent;
        })()}
    </div>
  );
};
