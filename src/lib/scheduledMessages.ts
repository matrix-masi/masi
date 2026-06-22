import {
  Direction,
  EventType,
  MsgType,
  type MatrixClient,
  type MatrixEvent,
} from "matrix-js-sdk";
import type {
  ScheduledMessageAttachment,
  ScheduledMessagePayload,
  Swarm,
} from "./types";
import { generateId } from "./session";
import { getImageDimensions, getVideoDimensions } from "./helpers";
import { markdownToMatrixHtml } from "./markdown";
import { parseRoomLink } from "./roomSearchServers";
import { findOrCreateScheduledRoom, findScheduledRoom } from "./scheduledMessageRoom";
import { sendWithFailover } from "./sendMessage";
import { joinRoomWithSwarm } from "./swarmRoomJoin";

export const SCHEDULED_MESSAGE_EVENT_TYPE = "m.masi.scheduled_message";
export const MAX_SCHEDULED_ATTEMPTS = 5;
export const RETRY_DELAY_MS = 60 * 60 * 1000;
const SESSION_STARTED_AT = Date.now();

export interface ScheduledMessageRecord {
  eventId: string;
  roomId: string;
  payload: ScheduledMessagePayload;
}

export interface DispatchSummary {
  sent: number;
  failed: number;
  paused: number;
  errors: string[];
}

export interface AddScheduledMessageInput {
  swarmId: string;
  to: string;
  targetRoomId?: string;
  message: string;
  scheduledAt: number;
  markdown: boolean;
  files?: File[];
}

export interface UploadScheduledAttachmentsResult {
  attachments: ScheduledMessageAttachment[];
  warnings: string[];
}

function isRedacted(event: MatrixEvent): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (event as any).isRedacted === "function" && (event as any).isRedacted()) {
    return true;
  }
  const unsigned = event.getUnsigned() as Record<string, unknown>;
  if (unsigned.redacted_because) return true;
  const content = event.getContent() as Record<string, unknown>;
  return Object.keys(content).length === 0;
}

function asScheduledPayload(content: Record<string, unknown>): ScheduledMessagePayload | null {
  if (content.version !== 1) return null;
  if (typeof content.id !== "string") return null;
  if (typeof content.swarmId !== "string") return null;
  if (typeof content.createdAt !== "number") return null;
  if (typeof content.scheduledAt !== "number") return null;
  if (typeof content.timezone !== "string") return null;
  if (typeof content.to !== "string") return null;
  if (typeof content.message !== "string") return null;
  if (typeof content.markdown !== "boolean") return null;
  if (!Array.isArray(content.attachments)) return null;

  return {
    version: 1,
    id: content.id,
    swarmId: content.swarmId,
    createdAt: content.createdAt,
    scheduledAt: content.scheduledAt,
    timezone: content.timezone,
    to: content.to,
    targetRoomId:
      typeof content.targetRoomId === "string" ? content.targetRoomId : undefined,
    message: content.message,
    markdown: content.markdown,
    attachments: content.attachments as ScheduledMessageAttachment[],
    attempts: typeof content.attempts === "number" ? content.attempts : 0,
    lastAttemptAt:
      typeof content.lastAttemptAt === "number" ? content.lastAttemptAt : undefined,
    lastError: typeof content.lastError === "string" ? content.lastError : undefined,
    pausedUntil:
      typeof content.pausedUntil === "number" ? content.pausedUntil : undefined,
    sentPartKeys: Array.isArray(content.sentPartKeys)
      ? content.sentPartKeys.filter((key): key is string => typeof key === "string")
      : undefined,
  };
}

function startOfToday(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function effectiveAttempts(payload: ScheduledMessagePayload, now: number): number {
  if (!payload.lastAttemptAt) return payload.attempts;
  if (payload.lastAttemptAt < SESSION_STARTED_AT) return 0;
  return payload.lastAttemptAt < startOfToday(now) ? 0 : payload.attempts;
}

async function redactEvent(client: MatrixClient, roomId: string, eventId: string): Promise<void> {
  await client.redactEvent(roomId, eventId);
}

async function backfillScheduledRoom(
  client: MatrixClient,
  roomId: string,
  maxPages = 40,
): Promise<void> {
  const room = client.getRoom(roomId);
  if (!room) return;

  for (let i = 0; i < maxPages; i++) {
    const token = room.getLiveTimeline().getPaginationToken(Direction.Backward);
    if (!token) break;
    await client.scrollback(room, 50);
  }
}

export async function listScheduledMessages(
  client: MatrixClient,
  roomId: string,
  opts: { backfill?: boolean } = {},
): Promise<ScheduledMessageRecord[]> {
  if (opts.backfill !== false) {
    await backfillScheduledRoom(client, roomId);
  }

  const room = client.getRoom(roomId);
  if (!room) return [];

  const records: ScheduledMessageRecord[] = [];
  const events = room.getLiveTimeline().getEvents();
  for (const event of events) {
    const eventId = event.getId();
    if (!eventId) continue;
    if (event.getType() !== SCHEDULED_MESSAGE_EVENT_TYPE) continue;
    if (isRedacted(event)) continue;

    const payload = asScheduledPayload(event.getContent() as Record<string, unknown>);
    if (!payload) continue;
    records.push({ eventId, roomId, payload });
  }

  return records.sort((a, b) => a.payload.scheduledAt - b.payload.scheduledAt);
}

export async function normalizeTargetRoomId(
  client: MatrixClient,
  to: string,
): Promise<string | undefined> {
  const parsed = parseRoomLink(to);
  if (!parsed) return undefined;
  if (parsed.startsWith("!")) return parsed;

  const joinedRoom = client.getRooms().find(
    (room) => room.roomId === parsed || room.name === parsed,
  );
  if (joinedRoom) return joinedRoom.roomId;

  if (parsed.startsWith("#")) {
    try {
      const resp = await client.getRoomIdForAlias(parsed);
      return resp.room_id;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function isTargetEncrypted(client: MatrixClient, roomId: string | undefined): boolean {
  if (!roomId) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const maybe = (client as any).isRoomEncrypted?.(roomId);
    return maybe === true;
  } catch {
    return false;
  }
}

export async function uploadScheduledAttachments(
  client: MatrixClient,
  files: File[],
  targetRoomId?: string,
): Promise<UploadScheduledAttachmentsResult> {
  const attachments: ScheduledMessageAttachment[] = [];
  const warnings: string[] = [];
  const encryptedTarget = isTargetEncrypted(client, targetRoomId);
  if (encryptedTarget) {
    warnings.push(
      "The target room is encrypted. Masi will use the Matrix SDK upload path, but encrypted attachment support may depend on SDK/server behavior.",
    );
  }

  for (const file of files) {
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      warnings.push(`${file.name} was skipped because only images and videos are supported.`);
      continue;
    }

    const uploadResp = await client.uploadContent(file, {
      name: file.name,
      type: file.type,
    });
    const info: Record<string, unknown> = {
      mimetype: file.type,
      size: file.size,
    };

    if (isImage) {
      const dims = await getImageDimensions(file);
      if (dims) {
        info.w = dims.width;
        info.h = dims.height;
      }
      attachments.push({
        msgtype: MsgType.Image,
        body: file.name,
        url: uploadResp.content_uri,
        info,
      });
    } else {
      const dims = await getVideoDimensions(file);
      if (dims) {
        info.w = dims.width;
        info.h = dims.height;
        info.duration = dims.duration;
      }
      attachments.push({
        msgtype: MsgType.Video,
        body: file.name,
        url: uploadResp.content_uri,
        info,
      });
    }
  }

  return { attachments, warnings };
}

export async function addScheduledMessage(
  client: MatrixClient,
  input: AddScheduledMessageInput,
): Promise<{ record: ScheduledMessagePayload; roomId: string; warnings: string[] }> {
  const roomId = await findOrCreateScheduledRoom(client, input.swarmId);
  const targetRoomId =
    input.targetRoomId ?? (await normalizeTargetRoomId(client, input.to));
  const uploaded = await uploadScheduledAttachments(client, input.files ?? [], targetRoomId);
  const now = Date.now();
  const payload: ScheduledMessagePayload = {
    version: 1,
    id: generateId(),
    swarmId: input.swarmId,
    createdAt: now,
    scheduledAt: input.scheduledAt,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
    to: input.to,
    targetRoomId,
    message: input.message,
    markdown: input.markdown,
    attachments: uploaded.attachments,
    attempts: 0,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (client.sendEvent as any)(roomId, SCHEDULED_MESSAGE_EVENT_TYPE, payload);
  return { record: payload, roomId, warnings: uploaded.warnings };
}

export async function replaceScheduledMessage(
  client: MatrixClient,
  record: ScheduledMessageRecord,
  payload: ScheduledMessagePayload,
): Promise<ScheduledMessageRecord> {
  await redactEvent(client, record.roomId, record.eventId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp = await (client.sendEvent as any)(
    record.roomId,
    SCHEDULED_MESSAGE_EVENT_TYPE,
    payload,
  );
  return {
    eventId:
      typeof resp?.event_id === "string"
        ? resp.event_id
        : `${payload.id}-${Date.now()}`,
    roomId: record.roomId,
    payload,
  };
}

export async function deleteScheduledMessage(
  client: MatrixClient,
  record: ScheduledMessageRecord,
): Promise<void> {
  await redactEvent(client, record.roomId, record.eventId);
}

export async function resetScheduledRetries(
  client: MatrixClient,
  record: ScheduledMessageRecord,
): Promise<void> {
  await replaceScheduledMessage(client, record, {
    ...record.payload,
    attempts: 0,
    lastAttemptAt: undefined,
    lastError: undefined,
    pausedUntil: undefined,
  });
}

function buildTextContent(payload: ScheduledMessagePayload): Record<string, unknown> {
  if (!payload.markdown) {
    return { msgtype: MsgType.Text, body: payload.message };
  }
  return {
    msgtype: MsgType.Text,
    body: payload.message,
    format: "org.matrix.custom.html",
    formatted_body: markdownToMatrixHtml(payload.message),
  };
}

function buildAttachmentContent(
  attachment: ScheduledMessageAttachment,
): Record<string, unknown> {
  return {
    msgtype: attachment.msgtype,
    body: attachment.body,
    ...(attachment.file ? { file: attachment.file } : { url: attachment.url }),
    info: attachment.info,
  };
}

async function markFailure(
  client: MatrixClient,
  record: ScheduledMessageRecord,
  now: number,
  error: string,
): Promise<void> {
  const attempts = effectiveAttempts(record.payload, now) + 1;
  await replaceScheduledMessage(client, record, {
    ...record.payload,
    attempts,
    lastAttemptAt: now,
    lastError: error,
    pausedUntil: now + RETRY_DELAY_MS,
  });
}

async function markPartSent(
  client: MatrixClient,
  record: ScheduledMessageRecord,
  partKey: string,
): Promise<ScheduledMessageRecord> {
  const sentPartKeys = Array.from(
    new Set([...(record.payload.sentPartKeys ?? []), partKey]),
  );
  return replaceScheduledMessage(client, record, {
    ...record.payload,
    sentPartKeys,
    lastError: undefined,
  });
}

export async function dispatchDueMessages(args: {
  swarm: Swarm;
  clients: MatrixClient[];
  timeoutMs: number;
  now?: number;
}): Promise<DispatchSummary> {
  const { swarm, clients, timeoutMs } = args;
  const now = args.now ?? Date.now();
  const summary: DispatchSummary = { sent: 0, failed: 0, paused: 0, errors: [] };
  const primary = clients[0];
  if (!primary) {
    return { ...summary, failed: 1, errors: ["No available client for swarm."] };
  }

  const scheduledRoom = findScheduledRoom(primary, swarm.id);
  if (!scheduledRoom) return summary;

  const records = await listScheduledMessages(primary, scheduledRoom.roomId);
  for (const record of records) {
    const payload = record.payload;
    if (payload.scheduledAt > now) continue;
    if (payload.pausedUntil && payload.pausedUntil > now) {
      summary.paused += 1;
      continue;
    }
    if (effectiveAttempts(payload, now) >= MAX_SCHEDULED_ATTEMPTS) {
      summary.paused += 1;
      continue;
    }

    let targetRoomId =
      payload.targetRoomId ?? (await normalizeTargetRoomId(primary, payload.to));
    const joinTarget = targetRoomId ?? parseRoomLink(payload.to);
    if (!joinTarget) {
      const err = `Could not resolve target room for ${payload.to}.`;
      await markFailure(primary, record, now, err);
      summary.failed += 1;
      summary.errors.push(err);
      continue;
    }

    let availableClients = targetRoomId
      ? clients.filter(
          (client) => client.getRoom(targetRoomId)?.getMyMembership() === "join",
        )
      : [];
    if (availableClients.length === 0) {
      const joinResults = await joinRoomWithSwarm(joinTarget, clients);
      const joined = joinResults.some((result) => result.success);
      if (joined) {
        targetRoomId =
          targetRoomId ?? (await normalizeTargetRoomId(primary, payload.to));
        availableClients = targetRoomId
          ? clients.filter(
              (client) => client.getRoom(targetRoomId)?.getMyMembership() === "join",
            )
          : [];
      }
    }
    if (availableClients.length === 0) {
      const err = `No swarm account has joined ${payload.to}.`;
      await markFailure(primary, record, now, err);
      summary.failed += 1;
      summary.errors.push(err);
      continue;
    }

    const parts = [
      ...(payload.message.trim()
        ? [{ key: "text", content: buildTextContent(payload) }]
        : []),
      ...payload.attachments.map((attachment, index) => ({
        key: `attachment-${index}`,
        content: buildAttachmentContent(attachment),
      })),
    ].filter((part) => !(payload.sentPartKeys ?? []).includes(part.key));

    let sentAll = true;
    let lastError = "Failed to send scheduled message.";
    let currentRecord = record;
    for (const part of parts) {
      const result = await sendWithFailover(
        availableClients,
        targetRoomId,
        EventType.RoomMessage,
        part.content,
        timeoutMs,
      );
      if (!result.success) {
        sentAll = false;
        lastError = result.error ?? lastError;
        break;
      }
      currentRecord = await markPartSent(primary, currentRecord, part.key);
    }

    if (sentAll) {
      await deleteScheduledMessage(primary, currentRecord);
      summary.sent += 1;
    } else {
      await markFailure(primary, currentRecord, now, lastError);
      summary.failed += 1;
      summary.errors.push(lastError);
    }
  }

  return summary;
}
