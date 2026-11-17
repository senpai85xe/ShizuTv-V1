import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCodePaste,
  buildWatchPartyInviteUrl,
  buildWatchPartyWsUrl,
  computeSyncedPlaybackTime,
  createEmptyCodeSlots,
  filterPublicRooms,
  getHostDisplayName,
  getParticipantInitial,
  isValidRoomCode,
  joinCodeSlots,
  normalizeRoomCode,
  removeParticipant,
  resolveDefaultDisplayName,
  shouldApplyRemoteSeek,
  splitCodeIntoSlots,
  updateCodeSlot,
  upsertParticipant,
} from './watchParty.ts';

test('normalizeRoomCode uppercases and strips invalid symbols', () => {
  assert.equal(normalizeRoomCode(' ab-9x 42 '), 'AB9X42');
  assert.equal(normalizeRoomCode('k9x4m2!@#$'), 'K9X4M2');
  assert.equal(normalizeRoomCode('1234567890'), '12345678');
});

test('isValidRoomCode accepts 4-8 alphanumeric chars and rejects shorter inputs', () => {
  assert.equal(isValidRoomCode('ABC'), false);
  assert.equal(isValidRoomCode('AB12'), true);
  assert.equal(isValidRoomCode('K9X4M2'), true);
});

test('code slot helpers handle typing, paste, and focus progression cleanly', () => {
  const empty = createEmptyCodeSlots(6);
  assert.deepEqual(empty, ['', '', '', '', '', '']);

  const step1 = updateCodeSlot(empty, 0, 'k');
  assert.deepEqual(step1.nextSlots, ['K', '', '', '', '', '']);
  assert.equal(step1.nextFocusIndex, 1);

  const pasted = applyCodePaste(empty, 2, 'a9x-4m2');
  assert.deepEqual(pasted.nextSlots, ['A', '9', 'X', '4', 'M', '2']);
  assert.equal(joinCodeSlots(pasted.nextSlots), 'A9X4M2');
  assert.deepEqual(splitCodeIntoSlots('ab12'), ['A', 'B', '1', '2', '', '']);
});

test('resolveDefaultDisplayName falls back across trackers to Guest', () => {
  assert.equal(resolveDefaultDisplayName({}), 'Guest');
  assert.equal(
    resolveDefaultDisplayName({
      myanimelist: { tracker: 'myanimelist', id: '2', username: 'Roronoa' },
    }),
    'Roronoa',
  );
  assert.equal(
    resolveDefaultDisplayName({
      anilist: { tracker: 'anilist', id: '1', username: 'Tanjiro' },
      myanimelist: { tracker: 'myanimelist', id: '2', username: 'Roronoa' },
    }),
    'Tanjiro',
  );
});

test('upsertParticipant stays idempotent on reconnects', () => {
  const base = [
    { id: 'u1', name: 'Host', isHost: true, joinedAt: 100 },
  ];
  const added = upsertParticipant(base, {
    id: 'u2',
    name: 'Guest',
    isHost: false,
    joinedAt: 200,
  });
  assert.equal(added.length, 2);

  const reconnected = upsertParticipant(added, {
    id: 'u2',
    name: 'GuestRenamed',
    isHost: false,
    joinedAt: 200,
  });
  assert.equal(reconnected.length, 2);
  assert.equal(reconnected[1].name, 'GuestRenamed');

  const removed = removeParticipant(reconnected, 'u2');
  assert.equal(removed.length, 1);
  assert.equal(removed[0].id, 'u1');
});

test('computeSyncedPlaybackTime adjusts elapsed time when playing', () => {
  assert.equal(computeSyncedPlaybackTime(42, 1000, false, 6000), 42);
  assert.equal(computeSyncedPlaybackTime(42, 1000, true, 6000), 47);
});

test('shouldApplyRemoteSeek avoids micro jitter below threshold', () => {
  assert.equal(shouldApplyRemoteSeek(10.0, 10.8, 1.5), false);
  assert.equal(shouldApplyRemoteSeek(10.0, 12.1, 1.5), true);
});

test('filterPublicRooms excludes private rooms and getHostDisplayName resolves host', () => {
  const pub = {
    roomCode: 'PUB123',
    hostId: 'h1',
    isPublic: true,
    mediaId: '21',
    mediaTitle: 'One Piece',
    episodeNumber: 1,
    episodeTitle: 'Episode 1',
    isPlaying: true,
    currentTime: 0,
    updatedAt: 100,
    participants: [{ id: 'h1', name: 'Luffy', isHost: true, joinedAt: 100 }],
  };
  const priv = { ...pub, roomCode: 'PRV999', isPublic: false };
  const filtered = filterPublicRooms([pub, priv]);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].roomCode, 'PUB123');
  assert.equal(getHostDisplayName(pub), 'Luffy');
});

test('buildWatchPartyWsUrl and invite URLs map http/https cleanly', () => {
  assert.equal(
    buildWatchPartyWsUrl({ protocol: 'http:', host: '127.0.0.1:3000' }),
    'ws://127.0.0.1:3000/ws/watch-party',
  );
  assert.equal(
    buildWatchPartyWsUrl({ protocol: 'https:', host: 'shizutv.app' }),
    'wss://shizutv.app/ws/watch-party',
  );
  assert.equal(
    buildWatchPartyInviteUrl('k9x4m2', 'https://shizutv.app'),
    'https://shizutv.app/player?room=K9X4M2',
  );
  assert.equal(getParticipantInitial('  asta'), 'A');
  assert.equal(getParticipantInitial(''), 'G');
});
