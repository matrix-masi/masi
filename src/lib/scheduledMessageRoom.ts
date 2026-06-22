import type { MatrixClient, Room } from "matrix-js-sdk";
import { Preset, Visibility } from "matrix-js-sdk";

export const SCHEDULED_ROOM_NAME = "Calendar";
const LEGACY_SCHEDULED_ROOM_NAME = "Scheduled Messages";

const STORAGE_KEY = "masi_scheduled_rooms";
const AVATAR_STORAGE_KEY = "masi_calendar_room_avatar_mxc";

type ScheduledRoomMap = Record<string, string>;

const CALENDAR_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="32" fill="#2563eb"/>
  <rect x="26" y="34" width="76" height="68" rx="10" fill="#ffffff"/>
  <rect x="26" y="34" width="76" height="22" rx="10" fill="#93c5fd"/>
  <rect x="42" y="22" width="8" height="24" rx="4" fill="#dbeafe"/>
  <rect x="78" y="22" width="8" height="24" rx="4" fill="#dbeafe"/>
  <circle cx="45" cy="72" r="5" fill="#2563eb"/>
  <circle cx="64" cy="72" r="5" fill="#2563eb"/>
  <circle cx="83" cy="72" r="5" fill="#2563eb"/>
  <circle cx="45" cy="90" r="5" fill="#2563eb"/>
  <circle cx="64" cy="90" r="5" fill="#2563eb"/>
</svg>`;

function loadRoomMap(): ScheduledRoomMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as ScheduledRoomMap : {};
  } catch {
    return {};
  }
}

function saveRoomMap(map: ScheduledRoomMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getCachedScheduledRoomId(swarmId: string): string | null {
  return loadRoomMap()[swarmId] ?? null;
}

export function setCachedScheduledRoomId(swarmId: string, roomId: string): void {
  const map = loadRoomMap();
  map[swarmId] = roomId;
  saveRoomMap(map);
}

export function isScheduledMessagesRoom(room: Room | null | undefined): boolean {
  return room?.name === SCHEDULED_ROOM_NAME || room?.name === LEGACY_SCHEDULED_ROOM_NAME;
}

export function findScheduledRoom(client: MatrixClient, swarmId?: string): Room | null {
  if (swarmId) {
    const cachedRoomId = getCachedScheduledRoomId(swarmId);
    if (cachedRoomId) {
      const cached = client.getRoom(cachedRoomId);
      if (cached?.getMyMembership() === "join") return cached;
    }
  }

  const room = client
    .getRooms()
    .find((r) => r.getMyMembership() === "join" && isScheduledMessagesRoom(r));
  if (room && swarmId) setCachedScheduledRoomId(swarmId, room.roomId);
  return room ?? null;
}

function roomHasAvatar(room: Room): boolean {
  const avatarEvent = room.currentState.getStateEvents("m.room.avatar", "");
  const content = avatarEvent?.getContent() as Record<string, unknown> | undefined;
  return typeof content?.url === "string" && content.url.length > 0;
}

async function getCalendarAvatarMxc(client: MatrixClient): Promise<string> {
  const cached = localStorage.getItem(AVATAR_STORAGE_KEY);
  if (cached) return cached;

  const blob = new Blob([CALENDAR_ICON_SVG], { type: "image/svg+xml" });
  const uploadResp = await client.uploadContent(blob, {
    name: "calendar.svg",
    type: "image/svg+xml",
  });
  localStorage.setItem(AVATAR_STORAGE_KEY, uploadResp.content_uri);
  return uploadResp.content_uri;
}

async function ensureCalendarRoomAvatar(
  client: MatrixClient,
  roomId: string,
): Promise<void> {
  const room = client.getRoom(roomId);
  if (roomHasAvatar(room)) return;

  const url = await getCalendarAvatarMxc(client);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (client.sendStateEvent as any)(roomId, "m.room.avatar", { url }, "");
}

export async function findOrCreateScheduledRoom(
  client: MatrixClient,
  swarmId: string,
): Promise<string> {
  const existing = findScheduledRoom(client, swarmId);
  if (existing) {
    if (existing.name === LEGACY_SCHEDULED_ROOM_NAME) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).setRoomName?.(existing.roomId, SCHEDULED_ROOM_NAME).catch?.(() => {});
    }
    ensureCalendarRoomAvatar(client, existing.roomId).catch(() => {});
    return existing.roomId;
  }

  const resp = await client.createRoom({
    name: SCHEDULED_ROOM_NAME,
    visibility: Visibility.Private,
    preset: Preset.PrivateChat,
    invite: [],
  });
  setCachedScheduledRoomId(swarmId, resp.room_id);
  ensureCalendarRoomAvatar(client, resp.room_id).catch(() => {});
  return resp.room_id;
}
