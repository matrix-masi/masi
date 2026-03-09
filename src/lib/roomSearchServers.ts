/// <reference types="vite/client" />
const JOINMATRIX_SERVERS_URL =
  "https://servers.joinmatrix.org/servers.json";

/** In dev we use Vite proxy (same-origin). In production we use a CORS proxy because the single-file app runs from file:// or arbitrary origin. */
function getServersListUrl(): string {
  if (import.meta.env.DEV) {
    return "/joinmatrix-servers.json";
  }
  return `https://api.allorigins.win/raw?url=${encodeURIComponent(JOINMATRIX_SERVERS_URL)}`;
}

export interface RoomSearchServer {
  id: string;
  name: string;
  host: string;
}

interface JoinMatrixServerEntry {
  name?: string;
  server_domain?: string;
}

interface JoinMatrixResponse {
  public_servers?: JoinMatrixServerEntry[];
  private_servers?: JoinMatrixServerEntry[];
}

let serversCache: RoomSearchServer[] | null = null;

function serverDomainToHost(serverDomain: string): string {
  const idx = serverDomain.indexOf(":");
  return idx >= 0 ? serverDomain.slice(0, idx) : serverDomain;
}

export async function fetchJoinMatrixServers(): Promise<RoomSearchServer[]> {
  if (serversCache) return serversCache;
  const res = await fetch(getServersListUrl());
  if (!res.ok) throw new Error(`Failed to fetch servers: ${res.status}`);
  const data = (await res.json()) as JoinMatrixResponse;
  const entries = [
    ...(data.public_servers ?? []),
    ...(data.private_servers ?? []),
  ];
  const seen = new Set<string>();
  const list: RoomSearchServer[] = [];
  for (const entry of entries) {
    const domain = entry.server_domain?.trim();
    if (!domain) continue;
    const host = serverDomainToHost(domain);
    if (seen.has(host)) continue;
    seen.add(host);
    list.push({
      id: host,
      name: entry.name?.trim() || host,
      host,
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
