import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  List,
  Settings2,
  X,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import { getPreferredTitle, UnifiedChapter, UnifiedMedia } from '../types/media';
import { resolveChapterPages } from '../services/sourceEngine';

interface ReaderLocationState {
  media?: UnifiedMedia;
  chapters?: UnifiedChapter[];
  chapterIndex?: number;
}

export const ReaderPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, updateReaderPrefs, recordHistory, getLibraryEntry, upsertLibraryEntry } =
    useApp();

  const routeState = (location.state as ReaderLocationState | null) || {};
  const media: UnifiedMedia = routeState.media ?? {
    id: 'demo-manga',
    type: 'MANGA',
    title: { english: 'ShizuTv Reader Preview' },
  };
  const chapters: UnifiedChapter[] =
    routeState.chapters && routeState.chapters.length > 0
      ? routeState.chapters
      : [{ id: 'ch-1', number: 1, title: 'Chapter 1', pageCount: 12 }];

  const [chapterIndex, setChapterIndex] = useState(routeState.chapterIndex ?? 0);
  const currentChapter = chapters[chapterIndex] ?? chapters[0];
  const pages = resolveChapterPages(media, currentChapter);

  const [pageIndex, setPageIndex] = useState(0);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { mode, direction, fit, background } = state.readerPrefs;

  useEffect(() => {
    setPageIndex(0);
    recordHistory({
      mediaId: media.id,
      mediaType: media.type,
      media,
      chapterNumber: currentChapter.number,
      pageIndex: 0,
      totalPages: pages.length,
    });
    const existing = getLibraryEntry(media.id);
    if (existing && currentChapter.number > existing.progress) {
      void upsertLibraryEntry(
        media,
        existing.status,
        currentChapter.number,
        existing.score,
        existing.notes,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode === 'webtoon') return;
      const step = mode === 'double' ? 2 : 1;
      if (e.key === 'ArrowRight') {
        if (direction === 'rtl') setPageIndex((p) => Math.max(0, p - step));
        else setPageIndex((p) => Math.min(pages.length - 1, p + step));
      } else if (e.key === 'ArrowLeft') {
        if (direction === 'rtl') setPageIndex((p) => Math.min(pages.length - 1, p + step));
        else setPageIndex((p) => Math.max(0, p - step));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, direction, pages.length]);

  const bgClass =
    background === 'white'
      ? 'bg-white text-slate-900'
      : background === 'sepia'
        ? 'bg-[#f4ecd8] text-[#433422]'
        : background === 'dark'
          ? 'bg-zinc-900 text-white'
          : 'bg-black text-white';

  const title = getPreferredTitle(media.title, state.contentPrefs.titlePreference);

  const nextPage = () => {
    const step = mode === 'double' ? 2 : 1;
    if (pageIndex + step < pages.length) {
      setPageIndex(pageIndex + step);
    } else if (chapterIndex < chapters.length - 1) {
      setChapterIndex((i) => i + 1);
    }
  };

  const prevPage = () => {
    const step = mode === 'double' ? 2 : 1;
    if (pageIndex - step >= 0) {
      setPageIndex(pageIndex - step);
    } else if (chapterIndex > 0) {
      setChapterIndex((i) => i - 1);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col relative ${bgClass}`}>
      {/* Top App Bar */}
      <header
        className={`fixed top-0 inset-x-0 z-30 flex items-center justify-between px-4 py-3 bg-black/80 text-white backdrop-blur-md transition-transform duration-200 ${
          chromeVisible ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl hover:bg-white/10"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-extrabold truncate">{title}</p>
            <p className="text-xs text-white/75 truncate">
              Chapter {currentChapter.number} — {currentChapter.title}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setChaptersOpen(true)}
            className="p-2 rounded-xl hover:bg-white/10"
            title="Chapters"
          >
            <List className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-xl hover:bg-white/10"
            title="Reader Settings"
          >
            <Settings2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Reader Viewport */}
      <div
        onClick={() => setChromeVisible((v) => !v)}
        className="flex-1 flex flex-col items-center justify-center py-16 px-2 sm:px-4 cursor-pointer"
      >
        {mode === 'webtoon' ? (
          <div className="w-full max-w-3xl flex flex-col items-center gap-1">
            {pages.map((src, idx) => (
              <img
                key={idx}
                src={src}
                alt={`Page ${idx + 1}`}
                className={
                  fit === 'width'
                    ? 'w-full h-auto'
                    : fit === 'height'
                      ? 'max-h-screen w-auto'
                      : 'max-w-full h-auto'
                }
              />
            ))}
          </div>
        ) : mode === 'double' ? (
          <div
            className={`flex items-center justify-center gap-2 max-w-6xl ${
              direction === 'rtl' ? 'flex-row-reverse' : 'flex-row'
            }`}
          >
            <img
              src={pages[pageIndex]}
              alt={`Page ${pageIndex + 1}`}
              className="max-h-[82vh] w-auto rounded shadow-lg"
            />
            {pages[pageIndex + 1] && (
              <img
                src={pages[pageIndex + 1]}
                alt={`Page ${pageIndex + 2}`}
                className="max-h-[82vh] w-auto rounded shadow-lg"
              />
            )}
          </div>
        ) : (
          <img
            src={pages[pageIndex]}
            alt={`Page ${pageIndex + 1}`}
            className={
              fit === 'height'
                ? 'max-h-[82vh] w-auto rounded shadow-lg'
                : 'max-w-3xl w-full h-auto rounded shadow-lg'
            }
          />
        )}
      </div>

      {/* Bottom Bar */}
      <footer
        className={`fixed bottom-0 inset-x-0 z-30 bg-black/85 text-white backdrop-blur-md px-4 py-3 transition-transform duration-200 ${
          chromeVisible ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <button
            type="button"
            disabled={chapterIndex <= 0}
            onClick={() => setChapterIndex((i) => Math.max(0, i - 1))}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-35 text-xs font-bold"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Prev Ch</span>
          </button>

          {mode !== 'webtoon' ? (
            <div className="flex-1 flex items-center gap-3">
              <button type="button" onClick={prevPage} className="p-1.5 rounded-lg hover:bg-white/10">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input
                type="range"
                min={0}
                max={pages.length - 1}
                value={pageIndex}
                onChange={(e) => setPageIndex(Number(e.target.value))}
                className="flex-1 accent-[var(--sx-primary)]"
              />
              <span className="text-xs font-mono-tabular">
                {pageIndex + 1}/{pages.length}
              </span>
              <button type="button" onClick={nextPage} className="p-1.5 rounded-lg hover:bg-white/10">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <span className="text-xs font-bold text-white/80">
              Webtoon Vertical · {pages.length} Pages
            </span>
          )}

          <button
            type="button"
            disabled={chapterIndex >= chapters.length - 1}
            onClick={() => setChapterIndex((i) => Math.min(chapters.length - 1, i + 1))}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-35 text-xs font-bold"
          >
            <span>Next Ch</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </footer>

      {/* Chapters Modal */}
      {chaptersOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 text-[var(--sx-on-surface)]">
          <div className="w-full sm:max-w-md max-h-[75vh] flex flex-col bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] rounded-t-2xl sm:rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--sx-outline)]">
              <h3 className="text-base font-extrabold">Chapters ({chapters.length})</h3>
              <button type="button" onClick={() => setChaptersOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {chapters.map((ch, idx) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => {
                    setChapterIndex(idx);
                    setChaptersOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold ${
                    idx === chapterIndex
                      ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                      : 'hover:bg-[var(--sx-surface-high)]'
                  }`}
                >
                  Chapter {ch.number} — {ch.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Reader Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 text-[var(--sx-on-surface)]">
          <div className="w-full sm:max-w-md bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] rounded-t-2xl sm:rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold">Reader Layout</h3>
              <button type="button" onClick={() => setSettingsOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--sx-on-surface-muted)]">Mode</label>
              <div className="grid grid-cols-3 gap-2">
                {(['webtoon', 'single', 'double'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => updateReaderPrefs({ mode: m })}
                    className={`py-2 rounded-xl text-xs font-bold capitalize border ${
                      mode === m
                        ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] border-[var(--sx-primary)]'
                        : 'bg-[var(--sx-surface-high)] border-[var(--sx-outline)]'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--sx-on-surface-muted)]">
                Reading Direction
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updateReaderPrefs({ direction: 'ltr' })}
                  className={`py-2 rounded-xl text-xs font-bold border ${
                    direction === 'ltr'
                      ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] border-[var(--sx-primary)]'
                      : 'bg-[var(--sx-surface-high)] border-[var(--sx-outline)]'
                  }`}
                >
                  Left to Right
                </button>
                <button
                  type="button"
                  onClick={() => updateReaderPrefs({ direction: 'rtl' })}
                  className={`py-2 rounded-xl text-xs font-bold border ${
                    direction === 'rtl'
                      ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] border-[var(--sx-primary)]'
                      : 'bg-[var(--sx-surface-high)] border-[var(--sx-outline)]'
                  }`}
                >
                  Right to Left (Manga)
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--sx-on-surface-muted)]">
                Canvas Background
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['black', 'dark', 'white', 'sepia'] as const).map((bg) => (
                  <button
                    key={bg}
                    type="button"
                    onClick={() => updateReaderPrefs({ background: bg })}
                    className={`py-2 rounded-xl text-xs font-bold capitalize border ${
                      background === bg
                        ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] border-[var(--sx-primary)]'
                        : 'bg-[var(--sx-surface-high)] border-[var(--sx-outline)]'
                    }`}
                  >
                    {bg}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
