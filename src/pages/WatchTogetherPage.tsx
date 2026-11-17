import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  KeyRound,
  LogIn,
  MonitorOff,
  Plus,
  RotateCw,
  Tv,
  Users,
} from 'lucide-react';
import {
  applyCodePaste,
  buildWatchPartyWsUrl,
  createEmptyCodeSlots,
  filterPublicRooms,
  getHostDisplayName,
  isValidRoomCode,
  joinCodeSlots,
  normalizeRoomCode,
  updateCodeSlot,
  WATCH_PARTY_CODE_LENGTH,
  WatchPartyRoom,
} from '../utils/watchParty';
import { SmartImage } from '../components/SmartImage';

export const WatchTogetherPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [codeSlots, setCodeSlots] = useState<string[]>(() =>
    createEmptyCodeSlots(WATCH_PARTY_CODE_LENGTH),
  );
  const slotInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const [publicRooms, setPublicRooms] = useState<WatchPartyRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [refreshSpinning, setRefreshSpinning] = useState(false);

  const enteredCode = joinCodeSlots(codeSlots);
  const canJoinCode = isValidRoomCode(enteredCode) && !joining;

  const fetchPublicRooms = useCallback(async (manual = false) => {
    if (manual) {
      setRefreshSpinning(true);
    } else {
      setLoadingRooms(true);
    }
    try {
      const res = await fetch('/api/watch-party/rooms');
      if (res.ok) {
        const data = (await res.json()) as { rooms?: WatchPartyRoom[] };
        if (Array.isArray(data.rooms)) {
          setPublicRooms(filterPublicRooms(data.rooms));
        }
      }
    } catch {
      // Ignore transient network errors when refreshing lobby
    } finally {
      setLoadingRooms(false);
      if (manual) {
        window.setTimeout(() => setRefreshSpinning(false), 380);
      }
    }
  }, []);

  useEffect(() => {
    void fetchPublicRooms(false);

    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return;
    let ws: WebSocket | null = null;
    let closedByCleanup = false;

    try {
      ws = new WebSocket(buildWatchPartyWsUrl());
      ws.onopen = () => {
        if (!closedByCleanup && ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'lobby:subscribe' }));
        }
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as {
            type?: string;
            rooms?: WatchPartyRoom[];
          };
          if (msg.type === 'lobby:rooms' && Array.isArray(msg.rooms)) {
            setPublicRooms(filterPublicRooms(msg.rooms));
            setLoadingRooms(false);
          }
        } catch {
          // Ignore malformed WS message
        }
      };
    } catch {
      // WebSocket lobby optional if server unavailable
    }

    return () => {
      closedByCleanup = true;
      if (ws) {
        try {
          ws.onmessage = null;
          ws.onerror = null;
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'lobby:unsubscribe' }));
            ws.close();
          } else if (ws.readyState === WebSocket.CONNECTING) {
            ws.onopen = () => {
              try {
                ws?.close();
              } catch {
                // Ignore close errors
              }
            };
          }
        } catch {
          // Ignore close errors
        }
      }
    };
  }, [fetchPublicRooms]);

  const navigateIntoRoom = (roomCode: string, room?: WatchPartyRoom) => {
    const normalized = normalizeRoomCode(roomCode);
    if (room) {
      const total = Math.max(room.episodeNumber, room.totalEpisodes || 1);
      const episodes = Array.from({ length: total }, (_, idx) => ({
        id: `${room.mediaId}-ep-${idx + 1}`,
        number: idx + 1,
        title:
          idx + 1 === room.episodeNumber && room.episodeTitle
            ? room.episodeTitle
            : `Episode ${idx + 1}`,
        thumbnail: room.mediaBanner || room.mediaCover || null,
      }));
      navigate(`/player?room=${encodeURIComponent(normalized)}`, {
        state: {
          media: {
            id: room.mediaId,
            type: 'ANIME' as const,
            title: { english: room.mediaTitle },
            cover: room.mediaCover,
            banner: room.mediaBanner,
            episodes: total,
          },
          episodes,
          episodeIndex: Math.max(0, room.episodeNumber - 1),
        },
      });
      return;
    }
    navigate(`/player?room=${encodeURIComponent(normalized)}`);
  };

  const handleJoinByCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!isValidRoomCode(enteredCode)) {
      setJoinError('Enter a 6-character room code to join.');
      return;
    }

    setJoining(true);
    setJoinError(null);
    try {
      const res = await fetch(`/api/watch-party/rooms/${encodeURIComponent(enteredCode)}`);
      if (!res.ok) {
        setJoinError(`Room ${enteredCode} was not found. Check the code and try again.`);
        setJoining(false);
        return;
      }
      const data = (await res.json()) as { exists?: boolean; room?: WatchPartyRoom };
      if (!data.exists || !data.room) {
        setJoinError(`Room ${enteredCode} was not found.`);
        setJoining(false);
        return;
      }
      navigateIntoRoom(enteredCode, data.room);
    } catch {
      setJoinError('Unable to reach Watch Party server. Please try again.');
      setJoining(false);
    }
  };

  const handleSlotChange = (index: number, raw: string) => {
    setJoinError(null);
    const { nextSlots, nextFocusIndex } = updateCodeSlot(codeSlots, index, raw);
    setCodeSlots(nextSlots);
    if (raw.trim().length > 0 && nextFocusIndex !== index) {
      slotInputRefs.current[nextFocusIndex]?.focus();
    }
  };

  const handleSlotKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Backspace') {
      if (codeSlots[index]) {
        const next = [...codeSlots];
        next[index] = '';
        setCodeSlots(next);
        setJoinError(null);
        return;
      }
      if (index > 0) {
        e.preventDefault();
        const next = [...codeSlots];
        next[index - 1] = '';
        setCodeSlots(next);
        slotInputRefs.current[index - 1]?.focus();
      }
      return;
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      slotInputRefs.current[index - 1]?.focus();
      return;
    }
    if (e.key === 'ArrowRight' && index < WATCH_PARTY_CODE_LENGTH - 1) {
      e.preventDefault();
      slotInputRefs.current[index + 1]?.focus();
      return;
    }
    if (e.key === 'Enter') {
      void handleJoinByCode();
    }
  };

  const handleSlotPaste = (
    index: number,
    e: React.ClipboardEvent<HTMLInputElement>,
  ) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    const { nextSlots, nextFocusIndex } = applyCodePaste(codeSlots, index, pasted);
    setJoinError(null);
    setCodeSlots(nextSlots);
    slotInputRefs.current[nextFocusIndex]?.focus();
  };

  const handleBack = () => {
    if (location.key !== 'default') {
      navigate(-1);
    } else {
      navigate('/home');
    }
  };

  return (
    <div
      data-testid="watch-together-page"
      className="min-h-screen px-4 sm:px-6 pt-5 pb-12 max-w-2xl mx-auto space-y-6"
    >
      {/* Top Floating Pill Header */}
      <header className="flex items-center justify-between gap-3 pt-[env(safe-area-inset-top)]">
        <div className="inline-flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-full bg-[var(--sx-surface-container)]/78 backdrop-blur-xl border border-[var(--sx-outline)] shadow-sm">
          <button
            type="button"
            data-testid="watch-together-back-btn"
            onClick={handleBack}
            aria-label="Back"
            className="w-9 h-9 rounded-full bg-[var(--sx-surface-high)]/80 hover:bg-[var(--sx-surface-high)] flex items-center justify-center text-[var(--sx-on-surface)] transition-colors shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-[var(--sx-on-surface)] whitespace-nowrap">
            Watch Together
          </h1>
        </div>

        <button
          type="button"
          data-testid="watch-together-refresh-btn"
          onClick={() => void fetchPublicRooms(true)}
          aria-label="Refresh active rooms"
          title="Refresh active rooms"
          className="w-11 h-11 rounded-full bg-[var(--sx-surface-container)]/78 backdrop-blur-xl border border-[var(--sx-outline)] hover:border-[var(--sx-primary)]/40 flex items-center justify-center text-[var(--sx-on-surface)] shadow-sm transition-colors shrink-0"
        >
          <RotateCw
            className={`w-4 h-4 ${refreshSpinning ? 'animate-spin' : ''}`}
          />
        </button>
      </header>

      {/* Card 1: Join with Code */}
      <section
        aria-labelledby="join-code-heading"
        className="rounded-[28px] bg-[var(--sx-surface-container)]/80 backdrop-blur-2xl border border-[var(--sx-outline)] p-5 sm:p-6 shadow-sm space-y-5"
      >
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--sx-primary)]/12 text-[var(--sx-primary)]"
          >
            <KeyRound className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h2
              id="join-code-heading"
              className="text-base font-extrabold tracking-tight text-[var(--sx-on-surface)]"
            >
              Join with Code
            </h2>
            <p className="text-xs font-medium text-[var(--sx-on-surface-muted)] mt-0.5 leading-relaxed">
              Enter a 6-character room code to join a watch party
            </p>
          </div>
        </div>

        <div className="border-t border-[var(--sx-outline)]" />

        <form onSubmit={(e) => void handleJoinByCode(e)} className="space-y-4">
          <div
            role="group"
            aria-label="6-character room code"
            className="grid grid-cols-6 gap-2 sm:gap-3"
          >
            {codeSlots.map((char, idx) => (
              <input
                key={idx}
                ref={(el) => {
                  slotInputRefs.current[idx] = el;
                }}
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={1}
                aria-label={`Room code character ${idx + 1}`}
                data-testid={`watch-together-code-slot-${idx}`}
                value={char}
                onChange={(e) => handleSlotChange(idx, e.target.value)}
                onKeyDown={(e) => handleSlotKeyDown(idx, e)}
                onPaste={(e) => handleSlotPaste(idx, e)}
                className="h-12 sm:h-14 w-full rounded-2xl border border-[var(--sx-outline)] bg-[var(--sx-surface-high)]/45 text-center font-mono-tabular text-base sm:text-lg font-extrabold uppercase text-[var(--sx-on-surface)] focus:outline-none focus:border-[var(--sx-primary)] focus:ring-2 focus:ring-[var(--sx-primary)]/20 transition-all"
              />
            ))}
          </div>

          {joinError && (
            <p
              data-testid="watch-together-code-error"
              className="text-xs font-semibold text-red-500 dark:text-red-300 bg-red-500/10 border border-red-500/25 rounded-2xl px-3.5 py-2.5"
            >
              {joinError}
            </p>
          )}

          <button
            type="submit"
            data-testid="watch-together-join-btn"
            disabled={!canJoinCode}
            className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-sm font-bold flex items-center justify-center gap-2 whitespace-nowrap shadow-sm disabled:opacity-55 transition-all"
          >
            <LogIn className="w-4 h-4 shrink-0" />
            <span>{joining ? 'Joining...' : 'Join Room'}</span>
          </button>
        </form>
      </section>

      {/* Card 2: Active Public Rooms */}
      <section
        aria-labelledby="active-rooms-heading"
        className="rounded-[28px] bg-[var(--sx-surface-container)]/80 backdrop-blur-2xl border border-[var(--sx-outline)] p-5 sm:p-6 shadow-sm space-y-5"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--sx-primary)]/12 text-[var(--sx-primary)]"
            >
              <Users className="w-5 h-5" />
            </span>
            <div className="flex items-center gap-2.5 min-w-0">
              <h2
                id="active-rooms-heading"
                className="text-base font-extrabold tracking-tight text-[var(--sx-on-surface)] truncate"
              >
                Active Rooms
              </h2>
              <span
                data-testid="watch-together-active-count"
                className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-[var(--sx-primary)]/12 px-2 text-xs font-extrabold tabular-nums text-[var(--sx-primary)]"
              >
                {publicRooms.length}
              </span>
            </div>
          </div>

          <button
            type="button"
            data-testid="watch-together-host-btn"
            onClick={() => navigate('/player?host=1')}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[var(--sx-primary)]/12 hover:bg-[var(--sx-primary)]/20 text-xs font-bold text-[var(--sx-primary)] whitespace-nowrap shrink-0 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Host</span>
          </button>
        </div>

        <div className="border-t border-[var(--sx-outline)]" />

        {loadingRooms && publicRooms.length === 0 ? (
          <div className="py-10 text-center text-xs font-semibold text-[var(--sx-on-surface-muted)]">
            Checking active public rooms...
          </div>
        ) : publicRooms.length === 0 ? (
          <div
            data-testid="watch-together-empty-rooms"
            className="py-10 sm:py-12 text-center space-y-2.5"
          >
            <MonitorOff
              aria-hidden="true"
              className="w-10 h-10 mx-auto text-[var(--sx-on-surface)]/80 stroke-[1.75]"
            />
            <p className="text-sm font-extrabold text-[var(--sx-on-surface)]">
              No active rooms
            </p>
            <p className="text-xs font-medium text-[var(--sx-on-surface-muted)] max-w-[240px] mx-auto leading-relaxed">
              Rooms will appear here when someone creates one
            </p>
          </div>
        ) : (
          <ul
            data-testid="watch-together-rooms-list"
            className="divide-y divide-[var(--sx-outline)]"
          >
            {publicRooms.map((room) => {
              const hostName = getHostDisplayName(room);
              const thumb = room.mediaCover || room.mediaBanner;
              return (
                <li
                  key={room.roomCode}
                  data-testid="watch-together-room-card"
                  className="py-3.5 first:pt-1 last:pb-1 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-16 rounded-xl overflow-hidden bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] shrink-0 flex items-center justify-center">
                      {thumb ? (
                        <SmartImage
                          src={thumb}
                          alt={room.mediaTitle}
                          fallbackTitle={room.mediaTitle}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Tv className="w-5 h-5 text-[var(--sx-primary)]" />
                      )}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-extrabold text-[var(--sx-on-surface)] truncate">
                        {room.mediaTitle}
                      </p>
                      <p className="text-xs font-semibold text-[var(--sx-on-surface-muted)] truncate">
                        EP {room.episodeNumber} · {room.episodeTitle}
                      </p>
                      <p className="text-[11px] font-medium text-[var(--sx-on-surface-muted)] truncate">
                        <span>Host {hostName}</span>
                        <span aria-hidden="true"> · </span>
                        <span className="tabular-nums">
                          {room.participants.length}{' '}
                          {room.participants.length === 1 ? 'viewer' : 'viewers'}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono-tabular font-bold text-[var(--sx-on-surface)]">
                          {room.roomCode}
                        </span>
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid={`watch-together-join-public-${room.roomCode}`}
                    onClick={() => navigateIntoRoom(room.roomCode, room)}
                    className="min-h-[40px] px-4 py-2 rounded-full bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-xs font-bold whitespace-nowrap shrink-0 shadow-sm hover:opacity-90 transition-opacity"
                  >
                    Join
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};
