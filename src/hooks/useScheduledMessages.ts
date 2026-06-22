import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MatrixClient } from "matrix-js-sdk";
import { RoomEvent } from "matrix-js-sdk";
import type { ScheduledMessagePayload, Swarm } from "../lib/types";
import {
  addScheduledMessage,
  deleteScheduledMessage,
  listScheduledMessages,
  normalizeTargetRoomId,
  replaceScheduledMessage,
  resetScheduledRetries,
  uploadScheduledAttachments,
  type AddScheduledMessageInput,
  type ScheduledMessageRecord,
} from "../lib/scheduledMessages";
import { findOrCreateScheduledRoom, findScheduledRoom } from "../lib/scheduledMessageRoom";

export interface ScheduledMessagesByDay {
  [day: string]: ScheduledMessageRecord[];
}

function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function useScheduledMessages(
  client: MatrixClient | null,
  swarm: Swarm | null,
) {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ScheduledMessageRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locallyDeletedEventIdsRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(
    async (opts: { create?: boolean; backfill?: boolean } = {}) => {
      if (!client || !swarm) {
        setRoomId(null);
        setMessages([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const scheduledRoomId = opts.create
          ? await findOrCreateScheduledRoom(client, swarm.id)
          : findScheduledRoom(client, swarm.id)?.roomId ?? null;
        setRoomId(scheduledRoomId);
        if (!scheduledRoomId) {
          setMessages([]);
          return;
        }
        const records = await listScheduledMessages(client, scheduledRoomId, {
          backfill: opts.backfill,
        });
        setMessages(
          records.filter(
            (record) => !locallyDeletedEventIdsRef.current.has(record.eventId),
          ),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load calendar");
      } finally {
        setLoading(false);
      }
    },
    [client, swarm],
  );

  useEffect(() => {
    refresh({ backfill: true }).catch(() => {});
  }, [refresh]);

  useEffect(() => {
    if (!client) return;
    const onTimeline = () => {
      refresh({ backfill: false }).catch(() => {});
    };
    client.on(RoomEvent.Timeline, onTimeline);
    return () => {
      client.removeListener(RoomEvent.Timeline, onTimeline);
    };
  }, [client, refresh]);

  const add = useCallback(
    async (input: Omit<AddScheduledMessageInput, "swarmId">) => {
      if (!client || !swarm) throw new Error("No active swarm");
      const result = await addScheduledMessage(client, {
        ...input,
        swarmId: swarm.id,
      });
      await refresh({ backfill: false });
      return result;
    },
    [client, swarm, refresh],
  );

  const remove = useCallback(
    async (record: ScheduledMessageRecord) => {
      if (!client) throw new Error("No client");
      locallyDeletedEventIdsRef.current.add(record.eventId);
      setMessages((prev) => prev.filter((item) => item.eventId !== record.eventId));
      try {
        await deleteScheduledMessage(client, record);
        await refresh({ backfill: false });
      } catch (err) {
        locallyDeletedEventIdsRef.current.delete(record.eventId);
        await refresh({ backfill: false });
        throw err;
      }
    },
    [client, refresh],
  );

  const update = useCallback(
    async (
      record: ScheduledMessageRecord,
      input: Omit<AddScheduledMessageInput, "swarmId">,
    ) => {
      if (!client || !swarm) throw new Error("No active swarm");
      const targetRoomId =
        input.targetRoomId ?? (await normalizeTargetRoomId(client, input.to));
      const uploaded =
        input.files && input.files.length > 0
          ? await uploadScheduledAttachments(client, input.files, targetRoomId)
          : { attachments: record.payload.attachments, warnings: [] };
      await replaceScheduledMessage(client, record, {
        ...record.payload,
        scheduledAt: input.scheduledAt,
        to: input.to,
        targetRoomId,
        message: input.message,
        markdown: input.markdown,
        attachments: uploaded.attachments,
        attempts: 0,
        lastAttemptAt: undefined,
        lastError: undefined,
        pausedUntil: undefined,
        sentPartKeys: undefined,
      });
      await refresh({ backfill: false });
      return uploaded.warnings;
    },
    [client, swarm, refresh],
  );

  const resetRetries = useCallback(
    async (record: ScheduledMessageRecord) => {
      if (!client) throw new Error("No client");
      await resetScheduledRetries(client, record);
      await refresh({ backfill: false });
    },
    [client, refresh],
  );

  const messagesByDay = useMemo(() => {
    const grouped: ScheduledMessagesByDay = {};
    for (const message of messages) {
      const key = dayKey(message.payload.scheduledAt);
      grouped[key] = [...(grouped[key] ?? []), message];
    }
    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a, b) => a.payload.scheduledAt - b.payload.scheduledAt);
    }
    return grouped;
  }, [messages]);

  const updateLocalPayload = useCallback(
    (id: string, updater: (payload: ScheduledMessagePayload) => ScheduledMessagePayload) => {
      setMessages((prev) =>
        prev.map((record) =>
          record.payload.id === id
            ? { ...record, payload: updater(record.payload) }
            : record,
        ),
      );
    },
    [],
  );

  return {
    roomId,
    messages,
    messagesByDay,
    loading,
    error,
    refresh,
    add,
    update,
    remove,
    resetRetries,
    updateLocalPayload,
  };
}
