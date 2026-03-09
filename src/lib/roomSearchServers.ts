/// <reference types="vite/client" />
const HOMESERVERS_JSON_URL =
  "https://raw.githubusercontent.com/matrix-masi/homeservers/main/online-homeservers.json";

/** In dev we use Vite proxy (same-origin). In production we use a CORS proxy because the single-file app runs from file:// or arbitrary origin. */
function getServersListUrl(): string {
  if (import.meta.env.DEV) {
    return "/online-homeservers.json";
  }
  return `https://api.allorigins.win/raw?url=${encodeURIComponent(HOMESERVERS_JSON_URL)}`;
}

export interface RoomSearchServer {
  id: string;
  name: string;
  host: string;
}

interface OnlineHomeserverEntry {
  name?: string;
  url?: string;
  status?: string;
  responseTimeMs?: number;
}

let serversCache: RoomSearchServer[] | null = null;

function urlToHost(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch {
    const idx = url.indexOf(":");
    return idx >= 0 ? url.slice(0, idx) : url;
  }
}

export async function fetchJoinMatrixServers(): Promise<RoomSearchServer[]> {
  if (serversCache) return serversCache;
  const res = await fetch(getServersListUrl());
  if (!res.ok) throw new Error(`Failed to fetch servers: ${res.status}`);
  const data = (await res.json()) as OnlineHomeserverEntry[];
  const entries = Array.isArray(data) ? data : [];
  const withTime = entries
    .filter((e) => e.url?.trim() && e.status === "online")
    .map((e) => ({
      name: e.name?.trim() || urlToHost(e.url!),
      host: urlToHost(e.url!),
      responseTimeMs: typeof e.responseTimeMs === "number" ? e.responseTimeMs : Infinity,
    }))
    .sort((a, b) => a.responseTimeMs - b.responseTimeMs);
  const seen = new Set<string>();
  const list: RoomSearchServer[] = [];
  for (const entry of withTime) {
    if (seen.has(entry.host)) continue;
    seen.add(entry.host);
    list.push({
      id: entry.host,
      name: entry.name,
      host: entry.host,
    });
  }
  serversCache = list;
  return list;
}

/**
 * Parse a matrix.to URL or raw room ID/alias into a room identifier for joining.
 * Returns the room ID (!...) or room alias (#...) or null if invalid.
 */
export function parseRoomLink(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  if (raw.startsWith("!") || raw.startsWith("#")) {
    return raw;
  }

  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      const url = new URL(raw);
      if (!url.hostname.toLowerCase().includes("matrix.to")) return null;
      const fragment = url.hash;
      if (!fragment.startsWith("#/")) return null;
      const path = fragment.slice(2);
      const firstSegment = path.split("/")[0];
      if (!firstSegment) return null;
      const decoded = decodeURIComponent(firstSegment);
      if (decoded.startsWith("!") || decoded.startsWith("#")) return decoded;
      return null;
    }
  } catch {
    return null;
  }

  return null;
}

const NSFW_KEYWORD = "nsfw";

/**
 * Same as Element's cheapNsfwFilter: true if room name or topic contains "nsfw" (case-insensitive).
 * When "Allow NSFW" is off we filter with: rooms.filter(r => !isNsfwRoom(r)).
 * @see element-hq/element-web usePublicRoomDirectory.ts
 */
export function isNsfwRoom(room: {
  name?: string;
  topic?: string;
}): boolean {
  const name = room.name?.toLocaleLowerCase().includes(NSFW_KEYWORD) ?? false;
  const topic = room.topic?.toLocaleLowerCase().includes(NSFW_KEYWORD) ?? false;
  return name || topic;
}
