import React, { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Copy, LogOut, Share2, Users } from 'lucide-react';
import {
  buildWatchPartyInviteUrl,
  getParticipantInitial,
  WatchPartyConnectionStatus,
  WatchPartyRoom,
} from '../utils/watchParty';

export interface WatchPartyUIProps {
  room: WatchPartyRoom;
  currentParticipantId: string | null;
  connectionStatus: WatchPartyConnectionStatus;
  lastEventNotice?: string | null;
  onLeaveRoom: () => void;
}

export const WatchPartyUI: React.FC<WatchPartyUIProps> = ({
  room,
  currentParticipantId,
  connectionStatus,
  lastEventNotice,
  onLeaveRoom,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState<'code' | 'link' | null>(null);

  const handleCopy = async (kind: 'code' | 'link') => {
    const value =
      kind === 'code'
        ? room.roomCode
        : buildWatchPartyInviteUrl(room.roomCode);
    try {
      await navigator.clipboard.writeText(value);
      setCopiedTarget(kind);
      window.setTimeout(() => {
        setCopiedTarget((curr) => (curr === kind ? null : curr));
      }, 1800);
    } catch {
      // Clipboard API unavailable in restricted contexts
    }
  };

  const isReconnecting = connectionStatus === 'reconnecting';
  const statusText = isReconnecting ? 'Reconnecting' : 'Live Sync';

  return (
    <aside
      data-testid="watch-party-ui"
      data-no-gesture="true"
      aria-label="Watch Party"
      className="sx-player-popover w-full rounded-3xl bg-zinc-950/88 backdrop-blur-2xl border border-white/15 text-white shadow-2xl overflow-hidden"
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-3 border-b border-white/10">
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <span className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[var(--sx-player-accent)]">
            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xs font-extrabold tracking-tight text-white truncate">
              Watch Party
            </h2>
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-white/70 truncate">
              <span
                aria-hidden="true"
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  isReconnecting ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
                }`}
              />
              <span>{statusText}</span>
              <span aria-hidden="true">·</span>
              <span>{room.isPublic === false ? 'Private' : 'Public'}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {room.participants.length}{' '}
                {room.participants.length === 1 ? 'viewer' : 'viewers'}
              </span>
            </p>
          </div>
        </div>

        <button
          type="button"
          data-testid="watch-party-collapse-btn"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand Watch Party' : 'Minimize Watch Party'}
          className="min-h-[32px] min-w-[32px] sm:min-h-[36px] sm:min-w-[36px] rounded-full hover:bg-white/10 flex items-center justify-center text-white/75 hover:text-white transition-colors shrink-0"
        >
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {collapsed ? (
        <div className="px-3.5 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 text-xs">
            <span className="text-white/65">Room</span>
            <span
              data-testid="watch-party-room-code"
              className="font-mono-tabular font-black tracking-[0.14em] text-white"
            >
              {room.roomCode}
            </span>
          </div>
          <button
            type="button"
            data-testid="watch-party-leave-btn"
            onClick={onLeaveRoom}
            className="px-3 py-1.5 rounded-full bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 text-red-200 text-[11px] font-bold whitespace-nowrap shrink-0 transition-colors"
          >
            Leave Room
          </button>
        </div>
      ) : (
        <div className="p-2.5 space-y-2 sm:p-4 sm:space-y-4">
          {/* Room Code & Invite Controls */}
          <div className="rounded-2xl bg-white/[0.06] border border-white/10 px-3 py-1.5 sm:px-3.5 sm:py-3 flex items-center justify-between gap-2.5 sm:gap-3">
            <div className="min-w-0 flex sm:block items-baseline gap-2">
              <p className="text-[11px] font-medium text-white/65">Room</p>
              <p
                data-testid="watch-party-room-code"
                className="font-mono-tabular text-sm sm:text-lg font-black tracking-[0.16em] sm:tracking-[0.18em] text-white leading-tight sm:mt-0.5 select-all"
              >
                {room.roomCode}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                data-testid="watch-party-copy-code-btn"
                onClick={() => void handleCopy('code')}
                aria-label="Copy room code"
                title="Copy room code"
                className="inline-flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-2 rounded-full bg-white/10 hover:bg-white/20 text-[11px] font-bold text-white whitespace-nowrap shrink-0 transition-colors"
              >
                {copiedTarget === 'code' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
              <button
                type="button"
                data-testid="watch-party-copy-link-btn"
                onClick={() => void handleCopy('link')}
                aria-label="Copy invite link"
                title="Copy invite link"
                className="min-h-[30px] min-w-[30px] sm:min-h-[34px] sm:min-w-[34px] rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors shrink-0"
              >
                {copiedTarget === 'link' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Share2 className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {lastEventNotice && (
            <p
              data-testid="watch-party-event-notice"
              className="text-[11px] font-medium text-white/75 px-1 truncate"
            >
              {lastEventNotice}
            </p>
          )}

          {/* Current Participants List */}
          <div className="space-y-1 sm:space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <h3 className="text-[11px] sm:text-xs font-bold text-white/85">
                Current Participants ({room.participants.length})
              </h3>
            </div>
            <ul
              data-testid="watch-party-participants-list"
              className="max-h-16 sm:max-h-40 overflow-y-auto divide-y divide-white/10 pr-0.5"
            >
              {room.participants.map((participant) => {
                const isSelf = participant.id === currentParticipantId;
                const roleSegments: string[] = [participant.isHost ? 'Host' : 'Viewer'];
                if (isSelf) roleSegments.push('You');
                return (
                  <li
                    key={participant.id}
                    data-testid="watch-party-participant"
                    className="flex items-center justify-between gap-2 py-1 sm:py-2 first:pt-0.5 last:pb-0.5"
                  >
                    <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                      <span
                        aria-hidden="true"
                        className={`flex h-5 w-5 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-full text-[10px] sm:text-xs font-extrabold ${
                          participant.isHost
                            ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)]'
                            : 'bg-white/12 text-white'
                        }`}
                      >
                        {getParticipantInitial(participant.name)}
                      </span>
                      <span className="text-xs font-semibold text-white truncate">
                        {participant.name}
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-white/65 whitespace-nowrap shrink-0">
                      {roleSegments.join(' · ')}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Leave Room Button */}
          <button
            type="button"
            data-testid="watch-party-leave-btn"
            onClick={onLeaveRoom}
            className="w-full min-h-[38px] sm:min-h-[44px] px-4 py-1.5 sm:py-2.5 rounded-2xl bg-red-500/18 hover:bg-red-500/28 border border-red-400/30 text-red-200 text-xs font-bold flex items-center justify-center gap-2 whitespace-nowrap transition-colors"
          >
            <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>Leave Room</span>
          </button>
        </div>
      )}
    </aside>
  );
};
