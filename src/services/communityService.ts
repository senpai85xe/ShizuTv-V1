import { CommunityCategory, CommunityLinkedAnime, CommunityPost } from '../utils/community';
import { getOrCreateWatchPartyClientId } from '../utils/watchParty';

export async function fetchCommunityPosts(): Promise<CommunityPost[]> {
  const clientId = getOrCreateWatchPartyClientId();
  const res = await fetch(`/api/community/posts?clientId=${encodeURIComponent(clientId)}`);
  if (!res.ok) {
    throw new Error('Failed to load community posts');
  }
  const data = (await res.json()) as { posts?: CommunityPost[] };
  return Array.isArray(data.posts) ? data.posts : [];
}

export async function createCommunityPost(input: {
  category: CommunityCategory;
  title: string;
  body: string;
  linkedAnime: CommunityLinkedAnime[];
  authorName: string;
  authorAvatar?: string;
}): Promise<CommunityPost> {
  const clientId = getOrCreateWatchPartyClientId();
  const res = await fetch('/api/community/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...input,
      clientId,
    }),
  });
  const data = (await res.json()) as { post?: CommunityPost; message?: string };
  if (!res.ok || !data.post) {
    throw new Error(data.message || 'Could not publish post');
  }
  return data.post;
}

export async function voteCommunityPost(postId: string, vote: -1 | 0 | 1): Promise<CommunityPost> {
  const clientId = getOrCreateWatchPartyClientId();
  const res = await fetch(`/api/community/posts/${encodeURIComponent(postId)}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, vote }),
  });
  const data = (await res.json()) as { post?: CommunityPost; message?: string };
  if (!res.ok || !data.post) {
    throw new Error(data.message || 'Vote failed');
  }
  return data.post;
}

export async function recordCommunityPostView(postId: string): Promise<CommunityPost | null> {
  try {
    const clientId = getOrCreateWatchPartyClientId();
    const res = await fetch(`/api/community/posts/${encodeURIComponent(postId)}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { post?: CommunityPost };
    return data.post ?? null;
  } catch {
    return null;
  }
}

export async function addCommunityComment(input: {
  postId: string;
  body: string;
  authorName: string;
  authorAvatar?: string;
}): Promise<CommunityPost> {
  const clientId = getOrCreateWatchPartyClientId();
  const res = await fetch(`/api/community/posts/${encodeURIComponent(input.postId)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId,
      body: input.body,
      authorName: input.authorName,
      authorAvatar: input.authorAvatar,
    }),
  });
  const data = (await res.json()) as { post?: CommunityPost; message?: string };
  if (!res.ok || !data.post) {
    throw new Error(data.message || 'Could not post comment');
  }
  return data.post;
}

export async function deleteCommunityPost(postId: string): Promise<void> {
  const clientId = getOrCreateWatchPartyClientId();
  const res = await fetch(
    `/api/community/posts/${encodeURIComponent(postId)}?clientId=${encodeURIComponent(clientId)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) {
    throw new Error('Could not delete post');
  }
}
