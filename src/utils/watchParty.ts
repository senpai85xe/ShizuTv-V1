import { TrackerProfile } from '../types/media';

export interface WatchPartyParticipant {
  id: string;
  name: string;
  isHost: boolean;
  joinedAt: number;
}

export interface WatchPartyRoom {
  roomCode: string;
  hostId: string;
  isPublic?: boolean;
  mediaId: string;
  mediaTitle: string;
  mediaCover?: string;
  mediaBanner?: string;
  totalEpisodes?: number;
  episodeNumber: number;
  episodeTitle: string;
  isPlaying: boolean;
  currentTime: number;
  updatedAt: number;
  participants: WatchPartyParticipant[];
}

export type WatchPartySyncAction = 'play' | 'pause' | 'seek' | 'episode';

export interface WatchPartySyncPayload {
  action: WatchPartySyncAction;
  currentTime: number;
  isPlaying: boolean;
  episodeNumber: number;
  episodeTitle: string;
  updatedAt?: number;
}

export type WatchPartyConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

export const WATCH_PARTY_CODE_LENGTH = 6;

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

export function isValidRoomCode(code: string): boolean {
  const normalized = normalizeRoomCode(code);
  return normalized.length >= 4 && normalized.length <= 8;
}

export function createEmptyCodeSlots(length = WATCH_PARTY_CODE_LENGTH): string[] {
  return Array.from({ length }, () => '');
}

export function splitCodeIntoSlots(
  code: string,
  length = WATCH_PARTY_CODE_LENGTH,
): string[] {
  const normalized = normalizeRoomCode(code).slice(0, length);
  return Array.from({ length }, (_, idx) => normalized[idx] ?? '');
}

export function joinCodeSlots(slots: string[]): string {
  return slots.map((s) => normalizeRoomCode(s).slice(0, 1)).join('');
}

export function updateCodeSlot(
  slots: string[],
  index: number,
  rawInput: string,
): { nextSlots: string[]; nextFocusIndex: number } {
  const length = slots.length || WATCH_PARTY_CODE_LENGTH;
  const clampedIdx = Math.max(0, Math.min(length - 1, index));
  const cleaned = normalizeRoomCode(rawInput);
  const nextSlots = [...slots];

  if (!cleaned) {
    nextSlots[clampedIdx] = '';
    return { nextSlots, nextFocusIndex: clampedIdx };
  }

  if (cleaned.length === 1) {
    nextSlots[clampedIdx] = cleaned;
    return {
      nextSlots,
      nextFocusIndex: Math.min(length - 1, clampedIdx + 1),
    };
  }

  return applyCodePaste(nextSlots, clampedIdx, cleaned);
}

export function applyCodePaste(
  slots: string[],
  startIndex: number,
  pastedText: string,
): { nextSlots: string[]; nextFocusIndex: number } {
  const length = slots.length || WATCH_PARTY_CODE_LENGTH;
  const cleaned = normalizeRoomCode(pastedText).slice(0, length);
  if (!cleaned) {
    return { nextSlots: [...slots], nextFocusIndex: Math.max(0, startIndex) };
  }

  const nextSlots = [...slots];
  const baseIdx = cleaned.length >= length ? 0 : Math.max(0, Math.min(length - 1, startIndex));
  let written = 0;
  for (let i = 0; i < cleaned.length && baseIdx + i < length; i++) {
    nextSlots[baseIdx + i] = cleaned[i];
    written++;
  }
  const nextFocusIndex = Math.min(length - 1, baseIdx + written);
  return { nextSlots, nextFocusIndex };
}

export function resolveDefaultDisplayName(profiles: {
  anilist?: TrackerProfile;
  myanimelist?: TrackerProfile;
  kitsu?: TrackerProfile;
}): string {
  const candidates = [
    profiles.anilist?.username,
    profiles.myanimelist?.username,
    profiles.kitsu?.username,
  ];
  for (const username of candidates) {
    if (typeof username === 'string' && username.trim().length > 0) {
      return username.trim().slice(0, 28);
    }
  }
  return 'Guest';
}

export function upsertParticipant(
  list: WatchPartyParticipant[],
  participant: WatchPartyParticipant,
): WatchPartyParticipant[] {
  const existingIdx = list.findIndex((p) => p.id === participant.id);
  if (existingIdx === -1) {
    return [...list, participant];
  }
  const next = [...list];
  next[existingIdx] = { ...next[existingIdx], ...participant };
  return next;
}

export function removeParticipant(
  list: WatchPartyParticipant[],
  participantId: string,
): WatchPartyParticipant[] {
  return list.filter((p) => p.id !== participantId);
}

export function computeSyncedPlaybackTime(
  currentTime: number,
  updatedAt: number,
  isPlaying: boolean,
  nowMs = Date.now(),
): number {
  const safeTime = Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0;
  if (!isPlaying || !Number.isFinite(updatedAt) || updatedAt <= 0) {
    return safeTime;
  }
  const elapsedSec = Math.max(0, Math.min(30, (nowMs - updatedAt) / 1000));
  return Math.round((safeTime + elapsedSec) * 100) / 100;
}

export function shouldApplyRemoteSeek(
  localTime: number,
  remoteTime: number,
  thresholdSeconds = 1.5,
): boolean {
  if (!Number.isFinite(remoteTime) || remoteTime < 0) return false;
  if (!Number.isFinite(localTime)) return true;
  return Math.abs(localTime - remoteTime) >= thresholdSeconds;
}

export function buildWatchPartyWsUrl(locationLike?: {
  protocol?: string;
  host?: string;
}): string {
  const loc =
    locationLike ??
    (typeof window !== 'undefined'
      ? { protocol: window.location.protocol, host: window.location.host }
      : { protocol: 'http:', host: '127.0.0.1:3000' });
  const wsProto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProto}//${loc.host || '127.0.0.1:3000'}/ws/watch-party`;
}

export function buildWatchPartyInviteUrl(
  roomCode: string,
  origin?: string,
): string {
  const normalized = normalizeRoomCode(roomCode);
  const base =
    origin ??
    (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:3000');
  return `${base}/player?room=${encodeURIComponent(normalized)}`;
}

export function getParticipantInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toUpperCase() : 'G';
}

export function filterPublicRooms(rooms: WatchPartyRoom[]): WatchPartyRoom[] {
  return rooms.filter((room) => room.isPublic !== false);
}

export function getHostDisplayName(room: WatchPartyRoom): string {
  const host = room.participants.find((p) => p.id === room.hostId || p.isHost);
  return host?.name || 'Host';
}
