import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';

type WatchPartyTrack = 'H-Sub' | 'Dub';

interface WatchPartyParticipant {
  id: string;
  name: string;
  clientId: string;
  isHost: boolean;
  joinedAt: number;
}

interface WatchPartyChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  sentAt: number;
}

interface WatchPartyRoomState {
  roomCode: string;
  roomName: string;
  track: WatchPartyTrack;
  hostId: string;
  hostClientId: string;
  hostAvatar?: string;
  isPublic: boolean;
  mediaId: string;
  mediaTitle: string;
  mediaCover?: string;
  mediaBanner?: string;
  totalEpisodes: number;
  episodeNumber: number;
  episodeTitle: string;
  isPlaying: boolean;
  currentTime: number;
  createdAt: number;
  updatedAt: number;
  peakParticipants: number;
  messagesCount: number;
  emptySince?: number;
  messages: WatchPartyChatMessage[];
  participants: WatchPartyParticipant[];
}

interface WatchPartyEndedRoomSummary {
  roomCode: string;
  roomName: string;
  track: WatchPartyTrack;
  hostName: string;
  hostAvatar?: string;
  hostClientId: string;
  isPublic: boolean;
  mediaId: string;
  mediaTitle: string;
  mediaCover?: string;
  mediaBanner?: string;
  episodeNumber: number;
  episodeTitle: string;
  createdAt: number;
  endedAt: number;
  durationMs: number;
  peakParticipants: number;
  messagesCount: number;
}

interface ConnectionMeta {
  participantId: string;
  clientId: string;
  roomCode: string | null;
  subscribedToLobby: boolean;
}

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const EMPTY_ROOM_GRACE_MS = 120_000;
const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rooms = new Map<string, WatchPartyRoomState>();
const roomExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const endedRooms: WatchPartyEndedRoomSummary[] = [];
const socketMeta = new Map<WebSocket, ConnectionMeta>();

function clearRoomExpiryTimer(roomCode: string) {
  const existing = roomExpiryTimers.get(roomCode);
  if (existing) {
    clearTimeout(existing);
    roomExpiryTimers.delete(roomCode);
  }
}

function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Guest';
  const trimmed = raw.trim().slice(0, 28);
  return trimmed.length > 0 ? trimmed : 'Guest';
}

function sanitizeRoomName(raw: unknown, hostName: string): string {
  if (typeof raw === 'string') {
    const trimmed = raw.trim().slice(0, 48);
    if (trimmed.length > 0) return trimmed;
  }
  return `${hostName}'s room`;
}

function sanitizeTrack(raw: unknown): WatchPartyTrack {
  return raw === 'Dub' ? 'Dub' : 'H-Sub';
}

function sanitizeRoomCode(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function sanitizeOptionalUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/')
  ) {
    return trimmed.slice(0, 500);
  }
  return undefined;
}

function generateUniqueRoomCode(): string {
  for (let attempt = 0; attempt < 24; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function serializeRoom(room: WatchPartyRoomState) {
  return {
    roomCode: room.roomCode,
    roomName: room.roomName,
    track: room.track,
    hostId: room.hostId,
    hostClientId: room.hostClientId,
    hostAvatar: room.hostAvatar,
    isPublic: room.isPublic,
    mediaId: room.mediaId,
    mediaTitle: room.mediaTitle,
    mediaCover: room.mediaCover,
    mediaBanner: room.mediaBanner,
    totalEpisodes: room.totalEpisodes,
    episodeNumber: room.episodeNumber,
    episodeTitle: room.episodeTitle,
    isPlaying: room.isPlaying,
    currentTime: room.currentTime,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    peakParticipants: room.peakParticipants,
    messagesCount: room.messagesCount,
    messages: room.messages,
    participants: room.participants.map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      joinedAt: p.joinedAt,
    })),
  };
}

function getAllLiveRoomsList() {
  return Array.from(rooms.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(serializeRoom);
}

function getPublicRoomsList() {
  return Array.from(rooms.values())
    .filter((room) => room.isPublic)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(serializeRoom);
}

function recordEndedRoom(room: WatchPartyRoomState, lastHostName: string) {
  const endedAt = Date.now();
  const durationMs = Math.max(0, endedAt - room.createdAt);
  const summary: WatchPartyEndedRoomSummary = {
    roomCode: room.roomCode,
    roomName: room.roomName,
    track: room.track,
    hostName: lastHostName || 'Host',
    hostAvatar: room.hostAvatar,
    hostClientId: room.hostClientId,
    isPublic: room.isPublic,
    mediaId: room.mediaId,
    mediaTitle: room.mediaTitle,
    mediaCover: room.mediaCover,
    mediaBanner: room.mediaBanner,
    episodeNumber: room.episodeNumber,
    episodeTitle: room.episodeTitle,
    createdAt: room.createdAt,
    endedAt,
    durationMs,
    peakParticipants: Math.max(1, room.peakParticipants),
    messagesCount: room.messagesCount,
  };
  endedRooms.unshift(summary);
  if (endedRooms.length > 40) {
    endedRooms.length = 40;
  }
}

function sendJson(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastLobbyRooms() {
  const payload = JSON.stringify({
    type: 'lobby:rooms',
    rooms: getPublicRoomsList(),
    allLiveRooms: getAllLiveRoomsList(),
    endedRooms,
  });
  for (const [clientWs, meta] of socketMeta.entries()) {
    if (meta.subscribedToLobby && clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(payload);
    }
  }
}

function broadcastToRoom(
  roomCode: string,
  payload: unknown,
  excludeSocket?: WebSocket,
) {
  const serialized = JSON.stringify(payload);
  for (const [clientWs, meta] of socketMeta.entries()) {
    if (
      meta.roomCode === roomCode &&
      clientWs !== excludeSocket &&
      clientWs.readyState === WebSocket.OPEN
    ) {
      clientWs.send(serialized);
    }
  }
}

function finalizeEndedRoom(roomCode: string, lastHostName?: string) {
  clearRoomExpiryTimer(roomCode);
  const room = rooms.get(roomCode);
  if (!room) return;
  const resolvedHostName =
    lastHostName ||
    room.participants.find((p) => p.id === room.hostId || p.isHost)?.name ||
    'Host';
  recordEndedRoom(room, resolvedHostName);
  rooms.delete(roomCode);
  broadcastLobbyRooms();
}

function detachFromCurrentRoom(ws: WebSocket) {
  const meta = socketMeta.get(ws);
  if (!meta || !meta.roomCode) return;

  const roomCode = meta.roomCode;
  meta.roomCode = null;
  const room = rooms.get(roomCode);
  if (!room) return;

  const departing = room.participants.find((p) => p.id === meta.participantId);
  const lastHostName =
    room.participants.find((p) => p.id === room.hostId || p.isHost)?.name ||
    departing?.name ||
    'Host';
  room.participants = room.participants.filter((p) => p.id !== meta.participantId);

  if (room.participants.length === 0) {
    room.isPlaying = false;
    room.emptySince = Date.now();
    room.updatedAt = Date.now();
    clearRoomExpiryTimer(roomCode);
    const expiryTimer = setTimeout(() => {
      const current = rooms.get(roomCode);
      if (current && current.participants.length === 0) {
        finalizeEndedRoom(roomCode, lastHostName);
      }
    }, EMPTY_ROOM_GRACE_MS);
    roomExpiryTimers.set(roomCode, expiryTimer);
    broadcastLobbyRooms();
    return;
  }

  if (room.hostId === meta.participantId) {
    const nextHost = room.participants[0];
    room.hostId = nextHost.id;
    room.participants = room.participants.map((p, idx) => ({
      ...p,
      isHost: idx === 0,
    }));
  }

  broadcastToRoom(roomCode, {
    type: 'party:presence',
    roomCode,
    hostId: room.hostId,
    participants: serializeRoom(room).participants,
    event: 'left',
    actorName: departing?.name || 'Guest',
  });
  broadcastLobbyRooms();
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/watch-party/rooms', (_req, res) => {
    res.json({
      rooms: getPublicRoomsList(),
      allLiveRooms: getAllLiveRoomsList(),
      endedRooms,
    });
  });

  app.get('/api/watch-party/rooms/:roomCode', (req, res) => {
    const code = sanitizeRoomCode(req.params.roomCode);
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ exists: false, message: 'Room not found' });
      return;
    }
    res.json({ exists: true, room: serializeRoom(room) });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (reqUrl.pathname !== '/ws/watch-party') {
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    const initialId = crypto.randomUUID();
    socketMeta.set(ws, {
      participantId: initialId,
      clientId: initialId,
      roomCode: null,
      subscribedToLobby: false,
    });

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw)) as Record<string, unknown>;
      } catch {
        sendJson(ws, {
          type: 'party:error',
          code: 'INVALID_PAYLOAD',
          message: 'Malformed message payload.',
        });
        return;
      }

      const meta = socketMeta.get(ws);
      if (!meta) return;

      const msgType = typeof msg.type === 'string' ? msg.type : '';

      if (msgType === 'lobby:subscribe') {
        meta.subscribedToLobby = true;
        sendJson(ws, {
          type: 'lobby:rooms',
          rooms: getPublicRoomsList(),
          allLiveRooms: getAllLiveRoomsList(),
          endedRooms,
        });
        return;
      }

      if (msgType === 'lobby:unsubscribe') {
        meta.subscribedToLobby = false;
        return;
      }

      if (msgType === 'party:create') {
        detachFromCurrentRoom(ws);

        const clientId =
          typeof msg.clientId === 'string' && msg.clientId.trim()
            ? msg.clientId.trim().slice(0, 64)
            : meta.clientId;
        meta.clientId = clientId;
        meta.participantId = clientId;

        const roomCode = generateUniqueRoomCode();
        const now = Date.now();
        const hostName = sanitizeName(msg.userName);
        const participant: WatchPartyParticipant = {
          id: meta.participantId,
          clientId,
          name: hostName,
          isHost: true,
          joinedAt: now,
        };

        const episodeNumber =
          typeof msg.episodeNumber === 'number' && Number.isFinite(msg.episodeNumber)
            ? Math.max(1, Math.floor(msg.episodeNumber))
            : 1;
        const totalEpisodes =
          typeof msg.totalEpisodes === 'number' && Number.isFinite(msg.totalEpisodes)
            ? Math.max(episodeNumber, Math.floor(msg.totalEpisodes))
            : Math.max(episodeNumber, 12);

        const room: WatchPartyRoomState = {
          roomCode,
          roomName: sanitizeRoomName(msg.roomName, hostName),
          track: sanitizeTrack(msg.track),
          hostId: participant.id,
          hostClientId: clientId,
          hostAvatar: sanitizeOptionalUrl(msg.hostAvatar),
          isPublic: msg.isPublic !== false,
          mediaId: typeof msg.mediaId === 'string' ? msg.mediaId : 'demo-anime',
          mediaTitle:
            typeof msg.mediaTitle === 'string' && msg.mediaTitle.trim()
              ? msg.mediaTitle.trim().slice(0, 120)
              : 'Anime Stream',
          mediaCover: sanitizeOptionalUrl(msg.mediaCover),
          mediaBanner: sanitizeOptionalUrl(msg.mediaBanner),
          totalEpisodes,
          episodeNumber,
          episodeTitle:
            typeof msg.episodeTitle === 'string' && msg.episodeTitle.trim()
              ? msg.episodeTitle.trim().slice(0, 120)
              : `Episode ${episodeNumber}`,
          isPlaying: Boolean(msg.isPlaying),
          currentTime:
            typeof msg.currentTime === 'number' && Number.isFinite(msg.currentTime)
              ? Math.max(0, msg.currentTime)
              : 0,
          createdAt: now,
          updatedAt: now,
          peakParticipants: 1,
          messagesCount: 0,
          messages: [],
          participants: [participant],
        };

        clearRoomExpiryTimer(roomCode);
        rooms.set(roomCode, room);
        meta.roomCode = roomCode;

        sendJson(ws, {
          type: 'party:state',
          yourParticipantId: participant.id,
          room: serializeRoom(room),
        });
        broadcastLobbyRooms();
        return;
      }

      if (msgType === 'party:join') {
        const requestedCode = sanitizeRoomCode(msg.roomCode);
        const room = rooms.get(requestedCode);
        if (!room) {
          sendJson(ws, {
            type: 'party:error',
            code: 'ROOM_NOT_FOUND',
            message: requestedCode
              ? `Room ${requestedCode} was not found.`
              : 'Enter a valid room code to join.',
          });
          return;
        }

        const clientId =
          typeof msg.clientId === 'string' && msg.clientId.trim()
            ? msg.clientId.trim().slice(0, 64)
            : meta.clientId;

        if (meta.roomCode && meta.roomCode !== requestedCode) {
          detachFromCurrentRoom(ws);
        }

        for (const [otherWs, otherMeta] of socketMeta.entries()) {
          if (
            otherWs !== ws &&
            otherMeta.roomCode === requestedCode &&
            otherMeta.clientId === clientId
          ) {
            otherMeta.roomCode = null;
          }
        }

        meta.clientId = clientId;
        meta.participantId = clientId;
        meta.roomCode = requestedCode;

        clearRoomExpiryTimer(requestedCode);
        delete room.emptySince;

        const now = Date.now();
        const displayName = sanitizeName(msg.userName);
        const shouldBecomeHost =
          room.participants.length === 0 || room.hostClientId === clientId;

        if (shouldBecomeHost) {
          room.hostId = clientId;
        }

        const existingIdx = room.participants.findIndex((p) => p.id === clientId);
        if (existingIdx >= 0) {
          room.participants[existingIdx] = {
            ...room.participants[existingIdx],
            name: displayName,
            isHost: room.hostId === clientId,
          };
        } else {
          room.participants.push({
            id: clientId,
            clientId,
            name: displayName,
            isHost: room.hostId === clientId,
            joinedAt: now,
          });
        }

        if (shouldBecomeHost) {
          room.participants = room.participants.map((p) => ({
            ...p,
            isHost: p.id === room.hostId,
          }));
        }

        room.peakParticipants = Math.max(room.peakParticipants, room.participants.length);

        sendJson(ws, {
          type: 'party:state',
          yourParticipantId: clientId,
          room: serializeRoom(room),
        });

        broadcastToRoom(
          requestedCode,
          {
            type: 'party:presence',
            roomCode: requestedCode,
            hostId: room.hostId,
            participants: serializeRoom(room).participants,
            event: 'joined',
            actorName: displayName,
          },
          ws,
        );
        broadcastLobbyRooms();
        return;
      }

      if (msgType === 'party:sync') {
        const roomCode = meta.roomCode;
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room) return;

        const now = Date.now();
        const action =
          msg.action === 'play' ||
          msg.action === 'pause' ||
          msg.action === 'seek' ||
          msg.action === 'episode'
            ? msg.action
            : 'seek';

        if (typeof msg.currentTime === 'number' && Number.isFinite(msg.currentTime)) {
          room.currentTime = Math.max(0, msg.currentTime);
        }
        if (typeof msg.isPlaying === 'boolean') {
          room.isPlaying = msg.isPlaying;
        }
        if (typeof msg.episodeNumber === 'number' && Number.isFinite(msg.episodeNumber)) {
          room.episodeNumber = Math.max(1, Math.floor(msg.episodeNumber));
          if (room.episodeNumber > room.totalEpisodes) {
            room.totalEpisodes = room.episodeNumber;
          }
        }
        if (typeof msg.episodeTitle === 'string' && msg.episodeTitle.trim()) {
          room.episodeTitle = msg.episodeTitle.trim().slice(0, 120);
        }
        room.updatedAt = now;

        broadcastToRoom(
          roomCode,
          {
            type: 'party:sync',
            roomCode,
            fromId: meta.participantId,
            action,
            currentTime: room.currentTime,
            isPlaying: room.isPlaying,
            episodeNumber: room.episodeNumber,
            episodeTitle: room.episodeTitle,
            updatedAt: now,
          },
          ws,
        );
        if (room.isPublic && action === 'episode') {
          broadcastLobbyRooms();
        }
        return;
      }

      if (msgType === 'party:chat') {
        const roomCode = meta.roomCode;
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room) return;
        const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, 280) : '';
        if (!text) return;

        const sender = room.participants.find((p) => p.id === meta.participantId);
        const chatMsg: WatchPartyChatMessage = {
          id: crypto.randomUUID(),
          senderId: meta.participantId,
          senderName: sender?.name || sanitizeName(msg.userName),
          text,
          sentAt: Date.now(),
        };
        room.messages.push(chatMsg);
        if (room.messages.length > 80) {
          room.messages.shift();
        }
        room.messagesCount += 1;
        room.updatedAt = Date.now();

        broadcastToRoom(roomCode, {
          type: 'party:chat',
          roomCode,
          message: chatMsg,
          messagesCount: room.messagesCount,
        });
        broadcastLobbyRooms();
        return;
      }

      if (msgType === 'party:reaction') {
        const roomCode = meta.roomCode;
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room) return;
        const emoji = typeof msg.emoji === 'string' ? msg.emoji.trim().slice(0, 8) : '';
        if (!emoji) return;

        const sender = room.participants.find((p) => p.id === meta.participantId);
        broadcastToRoom(roomCode, {
          type: 'party:reaction',
          roomCode,
          reaction: {
            id: crypto.randomUUID(),
            emoji,
            senderId: meta.participantId,
            senderName: sender?.name || sanitizeName(msg.userName),
            sentAt: Date.now(),
            laneSeed: Math.random(),
          },
        });
        return;
      }

      if (msgType === 'party:update') {
        const roomCode = meta.roomCode;
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room || room.hostId !== meta.participantId) return;

        if (typeof msg.mediaId === 'string' && msg.mediaId.trim()) {
          room.mediaId = msg.mediaId.trim().slice(0, 64);
          room.currentTime = 0;
        }
        if (typeof msg.mediaTitle === 'string' && msg.mediaTitle.trim()) {
          room.mediaTitle = msg.mediaTitle.trim().slice(0, 120);
        }
        if ('mediaCover' in msg) {
          room.mediaCover = sanitizeOptionalUrl(msg.mediaCover);
        }
        if ('mediaBanner' in msg) {
          room.mediaBanner = sanitizeOptionalUrl(msg.mediaBanner);
        }
        if (typeof msg.totalEpisodes === 'number' && Number.isFinite(msg.totalEpisodes)) {
          room.totalEpisodes = Math.max(1, Math.floor(msg.totalEpisodes));
        }
        if (typeof msg.episodeNumber === 'number' && Number.isFinite(msg.episodeNumber)) {
          room.episodeNumber = Math.max(1, Math.floor(msg.episodeNumber));
        }
        if (typeof msg.episodeTitle === 'string' && msg.episodeTitle.trim()) {
          room.episodeTitle = msg.episodeTitle.trim().slice(0, 120);
        }
        if (msg.track === 'H-Sub' || msg.track === 'Dub') {
          room.track = msg.track;
        }
        if (typeof msg.isPublic === 'boolean') {
          room.isPublic = msg.isPublic;
        }
        room.updatedAt = Date.now();

        for (const [clientWs, clientMeta] of socketMeta.entries()) {
          if (clientMeta.roomCode === roomCode && clientWs.readyState === WebSocket.OPEN) {
            sendJson(clientWs, {
              type: 'party:state',
              yourParticipantId: clientMeta.participantId,
              room: serializeRoom(room),
            });
          }
        }
        broadcastLobbyRooms();
        return;
      }

      if (msgType === 'party:end') {
        const roomCode = meta.roomCode;
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room) return;
        if (room.hostId !== meta.participantId && room.hostClientId !== meta.clientId) {
          detachFromCurrentRoom(ws);
          return;
        }

        const hostActor =
          room.participants.find((p) => p.id === meta.participantId)?.name || 'Host';

        for (const [clientWs, clientMeta] of socketMeta.entries()) {
          if (clientMeta.roomCode === roomCode) {
            clientMeta.roomCode = null;
            if (clientWs !== ws) {
              sendJson(clientWs, {
                type: 'party:ended',
                roomCode,
                message: `${hostActor} ended the Watch Party.`,
              });
            }
          }
        }
        finalizeEndedRoom(roomCode, hostActor);
        return;
      }

      if (msgType === 'party:leave') {
        detachFromCurrentRoom(ws);
      }
    });

    ws.on('close', () => {
      detachFromCurrentRoom(ws);
      socketMeta.delete(ws);
    });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`ShizuTv server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
