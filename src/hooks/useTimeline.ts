import { useState, useCallback, useRef } from "react";
import { Direction, type MatrixClient, type Room, type MatrixEvent } from "matrix-js-sdk";
import { formatDate } from "../lib/helpers";

export interface TimelineEntry {
  type: "date" | "event";
  key: string;
  dateStr?: string;
  event?: MatrixEvent;
}

function buildEntries(events: MatrixEvent[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let lastDateStr: string | null = null;

  for (const ev of events) {
    const dateStr = formatDate(ev.getDate());
    if (dateStr && dateStr !== lastDateStr) {
      entries.push({ type: "date", key: `date-${dateStr}-${ev.getId()}`, dateStr });
      lastDateStr = dateStr;
    }
    entries.push({ type: "event", key: ev.getId() || `ev-${entries.length}`, event: ev });
  }
  return entries;
}

export function useTimeline(client: MatrixClient | null, roomId: string | null) {
  const [isBackPaginating, setIsBackPaginating] = useState(false);
  const [version, setVersion] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const getRoom = useCallback((): Room | null => {
    if (!client || !roomId) return null;
    return client.getRoom(roomId);
  }, [client, roomId]);

  const getEntries = useCallback((): TimelineEntry[] => {
    void version;
    const room = getRoom();
    if (!room) return [];
    const events = room.getLiveTimeline().getEvents();
    return buildEntries(events);
  }, [getRoom, version]);

  const canPaginate = useCallback((): boolean => {
    const room = getRoom();
    if (!room) return false;
    return !!room.getLiveTimeline().getPaginationToken(Direction.Backward);
  }, [getRoom]);

  const loadPreviousMessages = useCallback(
    async (limit = 30) => {
      if (isBackPaginating || !client || !roomId) return;
      const room = client.getRoom(roomId);
      if (!room) return;
      const token = room.getLiveTimeline().getPaginationToken(Direction.Backward);
      if (!token) return;

      setIsBackPaginating(true);
      try {
        await client.scrollback(room, limit);
        bump();
      } catch (err) {
        console.error("Failed to load previous messages:", err);
      } finally {
        setIsBackPaginating(false);
      }
    },
    [isBackPaginating, client, roomId, bump]
  );

  const loadMessagesToDate = useCallback(
    async (targetDate: Date) => {
      if (isBackPaginating || !client || !roomId) return;
      const room = client.getRoom(roomId);
      if (!room) return;

      setIsBackPaginating(true);
      try {
        while (true) {
          const events = room.getLiveTimeline().getEvents();
          const oldest = events[0];
          if (oldest?.getDate() && oldest.getDate()! <= targetDate) break;
          const token = room.getLiveTimeline().getPaginationToken(Direction.Backward);
          if (!token) break;
          await client.scrollback(room, 50);
        }
        bump();
      } catch (err) {
        console.error("Failed to load messages to date:", err);
      } finally {
        setIsBackPaginating(false);
      }
    },
    [isBackPaginating, client, roomId, bump]
  );

  return {
    entries: getEntries(),
    isBackPaginating,
    canPaginate: canPaginate(),
    loadPreviousMessages,
    loadMessagesToDate,
    scrollRef,
    bump,
  };
}
