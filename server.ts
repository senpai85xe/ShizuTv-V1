import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
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

type CommunityCategory = 'announcements' | 'general' | 'feedback' | 'features' | 'help';
type CommunityLabel = 'resolved' | 'planned' | 'duplicate' | 'bug';

interface StoredCommunityComment {
  id: string;
  authorName: string;
  authorAvatar?: string | null;
  authorIsMod?: boolean;
  body: string;
  createdAt: number;
}

interface StoredCommunityPost {
  id: string;
  clientId: string;
  category: CommunityCategory;
  title: string;
  body: string;
  authorName: string;
  authorAvatar?: string | null;
  authorIsMod?: boolean;
  pinned?: boolean;
  label?: CommunityLabel | null;
  linkedAnime: Array<{ id: string | number; title: string; cover?: string | null }>;
  baseScore: number;
  votes: Record<string, -1 | 1>;
  comments: StoredCommunityComment[];
  views: number;
  createdAt: number;
}

const COMMUNITY_STORE_PATH = path.join(os.tmpdir(), 'shizutv-community-posts-v1.json');

function createSeedCommunityPosts(): StoredCommunityPost[] {
  const now = Date.now();
  return [
    {
      id: 'seed-welcome',
      clientId: 'shizutv-mod',
      category: 'announcements',
      title: 'Welcome to the Community — please read the rules',
      body: 'Welcome! This is the place to talk anime with **fellow fans**, share recommendations, report playback bugs, and suggest what ShizuTv should build next.\n> Keep spoilers wrapped like ||this|| and stay kind in every thread.',
      authorName: 'ShizuTv',
      authorIsMod: true,
      pinned: true,
      label: null,
      linkedAnime: [],
      baseScore: 16,
      votes: {},
      comments: [
        {
          id: 'seed-c1',
          authorName: 'ShizuTv',
          authorIsMod: true,
          body: 'Drop your favorite currently airing shows below!',
          createdAt: now - 2 * 86_400_000,
        },
        {
          id: 'seed-c2',
          authorName: 'Rio',
          body: 'Super clean frosted community hub — loving the Watch Together rooms too.',
          createdAt: now - 36 * 3600_000,
        },
      ],
      views: 192,
      createdAt: now - 3 * 86_400_000,
    },
    {
      id: 'seed-seasonal',
      clientId: 'seed-rio',
      category: 'features',
      title: 'Feature Suggestion: Top Seasonal Anime Showcase',
      body: 'Similar to the Trending row, adding a dedicated Top Seasonal Anime showcase with quick Watch Party buttons would make weekend bingeing effortless.',
      authorName: 'Rio',
      pinned: false,
      label: 'resolved',
      linkedAnime: [{ id: 21, title: 'One Piece' }],
      baseScore: 12,
      votes: {},
      comments: [
        {
          id: 'seed-c3',
          authorName: 'ShizuTv',
          authorIsMod: true,
          body: 'Marked Resolved — seasonal filters and Watch Party quick drawers are live now!',
          createdAt: now - 10 * 3600_000,
        },
      ],
      views: 78,
      createdAt: now - 16 * 3600_000,
    },
    {
      id: 'seed-softsubs',
      clientId: 'seed-apprehend',
      category: 'features',
      title: 'Multi-language soft-subs & custom font presets',
      body: 'Awesome work on the inline player gestures! Would love extra **soft-sub styling** presets and quick audio/subtitle switches right from fullscreen.',
      authorName: 'Apprehend',
      pinned: false,
      label: 'planned',
      linkedAnime: [],
      baseScore: 9,
      votes: {},
      comments: [
        {
          id: 'seed-c4',
          authorName: 'Mina',
          body: 'Fullscreen audio switcher already landed, waiting on font presets next!',
          createdAt: now - 12 * 3600_000,
        },
      ],
      views: 63,
      createdAt: now - 21 * 3600_000,
    },
    {
      id: 'seed-feedback-sync',
      clientId: 'seed-midnight',
      category: 'feedback',
      title: 'Mobile Watch Together room layout & chat polish',
      body: 'Tested a Watch Party on mobile portrait — the frosted glass chat overlay feels super smooth now. Would be nice to auto-remember preferred **H-Sub** or **Dub** track.',
      authorName: 'Midnight',
      pinned: false,
      label: 'resolved',
      linkedAnime: [{ id: 16498, title: 'Attack on Titan' }],
      baseScore: 7,
      votes: {},
      comments: [],
      views: 54,
      createdAt: now - 28 * 3600_000,
    },
    {
      id: 'seed-general-recs',
      clientId: 'seed-void',
      category: 'general',
      title: 'Anime suggestions & testing out the new Community tab!',
      body: 'I finished catching up on weekend episodes and need peak action/mystery recs.\n> Bonus points if there are no major ||ending spoilers|| in the replies!',
      authorName: 'TheVOID',
      pinned: false,
      label: null,
      linkedAnime: [{ id: 1535, title: 'Death Note' }],
      baseScore: 5,
      votes: {},
      comments: [
        {
          id: 'seed-c5',
          authorName: 'Kuro',
          body: 'Try **Monster** or **Steins;Gate** if you loved Death Note.',
          createdAt: now - 18 * 3600_000,
        },
      ],
      views: 94,
      createdAt: now - 2 * 86_400_000,
    },
    {
      id: 'seed-help-anilist',
      clientId: 'seed-brian',
      category: 'help',
      title: 'How to sync AniList watchlist progress automatically?',
      body: 'Just started using ShizuTv — how do I make episode progress update on AniList automatically after watching?',
      authorName: 'Brian',
      pinned: false,
      label: 'resolved',
      linkedAnime: [],
      baseScore: 4,
      votes: {},
      comments: [
        {
          id: 'seed-c6',
          authorName: 'ShizuTv',
          authorIsMod: true,
          body: 'Head to **Settings → Tracking & Accounts** to link AniList, then progress syncs automatically from the inline player!',
          createdAt: now - 20 * 3600_000,
        },
      ],
      views: 42,
      createdAt: now - 30 * 3600_000,
    },
  ];
}

function loadCommunityPosts(): StoredCommunityPost[] {
  try {
    if (fs.existsSync(COMMUNITY_STORE_PATH)) {
      const raw = fs.readFileSync(COMMUNITY_STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as StoredCommunityPost[];
      }
    }
  } catch {
    // Fall back to seeds if temp file unreadable
  }
  return createSeedCommunityPosts();
}

const communityPosts: StoredCommunityPost[] = loadCommunityPosts();

function persistCommunityPosts() {
  try {
    fs.writeFileSync(COMMUNITY_STORE_PATH, JSON.stringify(communityPosts), 'utf8');
  } catch {
    // Ignore disk write failure in ephemeral containers
  }
}

function serializeCommunityPost(post: StoredCommunityPost, clientId?: string) {
  const voteDelta = Object.values(post.votes).reduce<number>((sum, v) => sum + v, 0);
  return {
    id: post.id,
    clientId: post.clientId,
    category: post.category,
    title: post.title,
    body: post.body,
    authorName: post.authorName,
    authorAvatar: post.authorAvatar ?? null,
    authorIsMod: Boolean(post.authorIsMod),
    pinned: Boolean(post.pinned),
    label: post.label ?? null,
    linkedAnime: post.linkedAnime,
    score: post.baseScore + voteDelta,
    userVote: clientId ? post.votes[clientId] ?? 0 : 0,
    comments: post.comments,
    views: post.views,
    createdAt: post.createdAt,
  };
}

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

  app.get('/api/community/posts', (req, res) => {
    const clientId =
      typeof req.query.clientId === 'string' ? req.query.clientId.trim().slice(0, 64) : undefined;
    res.json({
      posts: communityPosts.map((p) => serializeCommunityPost(p, clientId)),
    });
  });

  app.post('/api/community/posts', (req, res) => {
    const bodyObj = (req.body ?? {}) as Record<string, unknown>;
    const rawCategory = typeof bodyObj.category === 'string' ? bodyObj.category : '';
    const allowedCategories: CommunityCategory[] = ['general', 'feedback', 'features', 'help'];
    if (!allowedCategories.includes(rawCategory as CommunityCategory)) {
      res.status(400).json({ message: 'Please choose a valid category.' });
      return;
    }
    const title = typeof bodyObj.title === 'string' ? bodyObj.title.trim().slice(0, 120) : '';
    const body = typeof bodyObj.body === 'string' ? bodyObj.body.trim().slice(0, 4000) : '';
    if (title.length < 3 || body.length < 5) {
      res.status(400).json({ message: 'Title (3+ chars) and body (5+ chars) are required.' });
      return;
    }
    const clientId =
      typeof bodyObj.clientId === 'string' && bodyObj.clientId.trim()
        ? bodyObj.clientId.trim().slice(0, 64)
        : crypto.randomUUID();
    const linkedRaw = Array.isArray(bodyObj.linkedAnime) ? bodyObj.linkedAnime.slice(0, 3) : [];
    const linkedAnime = linkedRaw
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => {
        const rawId =
          typeof item.id === 'number'
            ? item.id
            : typeof item.id === 'string'
              ? item.id.trim().slice(0, 80)
              : '';
        return {
          id: rawId,
          title: typeof item.title === 'string' ? item.title.trim().slice(0, 100) : 'Anime',
          cover: sanitizeOptionalUrl(item.cover) ?? null,
        };
      })
      .filter((item) => (typeof item.id === 'number' ? item.id > 0 : item.id.length > 0));

    const newPost: StoredCommunityPost = {
      id: `post-${crypto.randomUUID().slice(0, 8)}`,
      clientId,
      category: rawCategory as CommunityCategory,
      title,
      body,
      authorName: sanitizeName(bodyObj.authorName),
      authorAvatar: sanitizeOptionalUrl(bodyObj.authorAvatar) ?? null,
      authorIsMod: false,
      pinned: false,
      label: null,
      linkedAnime,
      baseScore: 1,
      votes: { [clientId]: 1 },
      comments: [],
      views: 1,
      createdAt: Date.now(),
    };
    communityPosts.unshift(newPost);
    persistCommunityPosts();
    res.status(201).json({ post: serializeCommunityPost(newPost, clientId) });
  });

  app.post('/api/community/posts/:id/vote', (req, res) => {
    const post = communityPosts.find((p) => p.id === req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found' });
      return;
    }
    const bodyObj = (req.body ?? {}) as Record<string, unknown>;
    const clientId =
      typeof bodyObj.clientId === 'string' && bodyObj.clientId.trim()
        ? bodyObj.clientId.trim().slice(0, 64)
        : '';
    if (!clientId) {
      res.status(400).json({ message: 'clientId required' });
      return;
    }
    const vote = bodyObj.vote;
    if (vote === 1 || vote === -1) {
      post.votes[clientId] = vote;
    } else {
      delete post.votes[clientId];
    }
    persistCommunityPosts();
    res.json({ post: serializeCommunityPost(post, clientId) });
  });

  app.post('/api/community/posts/:id/view', (req, res) => {
    const post = communityPosts.find((p) => p.id === req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found' });
      return;
    }
    post.views += 1;
    persistCommunityPosts();
    const clientId =
      typeof req.body?.clientId === 'string' ? req.body.clientId.trim().slice(0, 64) : undefined;
    res.json({ post: serializeCommunityPost(post, clientId) });
  });

  app.post('/api/community/posts/:id/comments', (req, res) => {
    const post = communityPosts.find((p) => p.id === req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found' });
      return;
    }
    const bodyObj = (req.body ?? {}) as Record<string, unknown>;
    const text = typeof bodyObj.body === 'string' ? bodyObj.body.trim().slice(0, 1200) : '';
    if (!text) {
      res.status(400).json({ message: 'Comment text required' });
      return;
    }
    const comment: StoredCommunityComment = {
      id: `cmt-${crypto.randomUUID().slice(0, 8)}`,
      authorName: sanitizeName(bodyObj.authorName),
      authorAvatar: sanitizeOptionalUrl(bodyObj.authorAvatar) ?? null,
      authorIsMod: false,
      body: text,
      createdAt: Date.now(),
    };
    post.comments.push(comment);
    persistCommunityPosts();
    const clientId =
      typeof bodyObj.clientId === 'string' ? bodyObj.clientId.trim().slice(0, 64) : undefined;
    res.status(201).json({ post: serializeCommunityPost(post, clientId), comment });
  });

  app.delete('/api/community/posts/:id', (req, res) => {
    const idx = communityPosts.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Post not found' });
      return;
    }
    const clientId =
      typeof req.query.clientId === 'string' ? req.query.clientId.trim().slice(0, 64) : '';
    if (communityPosts[idx].clientId !== clientId) {
      res.status(403).json({ message: 'Not allowed to delete this post' });
      return;
    }
    communityPosts.splice(idx, 1);
    persistCommunityPosts();
    res.json({ deleted: true });
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

        if (typeof msg.roomName === 'string' && msg.roomName.trim()) {
          const hostDisplay =
            room.participants.find((p) => p.id === room.hostId || p.isHost)?.name || 'Host';
          room.roomName = sanitizeRoomName(msg.roomName, hostDisplay);
        }
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
