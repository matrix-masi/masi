import { useState, useCallback, useRef, useEffect } from "react";
import { Direction, type MatrixClient, type Room, type MatrixEvent } from "matrix-js-sdk";
import { formatDate } from "../lib/helpers";

export interface TimelineEntry {
  type: "date" | "event";
  key: string;
  dateStr?: string;
  event?: MatrixEvent;
  latestEdit?: MatrixEvent;
  editHistory?: MatrixEvent[];
}

function getEditTargetId(event: MatrixEvent): string | null {
  const content = event.getContent() as Record<string, unknown>;
  const relation =
    content["m.relates_to"] as { rel_type?: string; event_id?: string } | undefined;
  if (relation?.rel_type !== "m.replace" || typeof relation.event_id !== "string") {
    return null;
  }
  return relation.event_id;
}

function buildEntries(events: MatrixEvent[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const eventIds = new Set(
    events
      .map((event) => event.getId())
      .filter((eventId): eventId is string => typeof eventId === "string")
  );
  const editsByTarget = new Map<string, MatrixEvent[]>();

  for (const event of events) {
    const targetId = getEditTargetId(event);
    if (!targetId || !eventIds.has(targetId)) continue;
    const edits = editsByTarget.get(targetId) || [];
    edits.push(event);
    editsByTarget.set(targetId, edits);
  }

  let lastDateStr: string | null = null;

  for (const ev of events) {
    const targetId = getEditTargetId(ev);
    if (targetId && eventIds.has(targetId)) {
      continue;
    }

    const dateStr = formatDate(ev.getDate());
    if (dateStr && dateStr !== lastDateStr) {
      entries.push({ type: "date", key: `date-${dateStr}-${ev.getId()}`, dateStr });
      lastDateStr = dateStr;
    }

    const eventId = ev.getId() || "";
    const editHistory = editsByTarget.get(eventId) || [];
    const latestEdit =
      editHistory.length > 0
        ? editHistory.reduce((latest, current) =>
            current.getTs() > latest.getTs() ? current : latest
          )
        : undefined;

    entries.push({
      type: "event",
      key: ev.getId() || `ev-${entries.length}`,
      event: ev,
      latestEdit,
      editHistory,
    });
  }
  return entries;
}

export type DateRange = { from: Date; to: Date };

export function useTimeline(client: MatrixClient | null, roomId: string | null) {
  const [isBackPaginating, setIsBackPaginating] = useState(false);
  const [version, setVersion] = useState(0);
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDateRange(null);
  }, [roomId]);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const getRoom = useCallback((): Room | null => {
    if (!client || !roomId) return null;
    return client.getRoom(roomId);
  }, [client, roomId]);

  const getEntries = useCallback((): TimelineEntry[] => {
    void version;
    const room = getRoom();
    if (!room) return [];
    let events = room.getLiveTimeline().getEvents();
    if (dateRange) {
      const fromTs = dateRange.from.getTime();
      const toTs = dateRange.to.getTime();
      events = events.filter((ev) => {
        const ts = ev.getTs();
        return ts >= fromTs && ts <= toTs;
      });
    }
    return buildEntries(events);
  }, [getRoom, version, dateRange]);

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

  const loadBetweenDates = useCallback(
    async (from: Date, to: Date) => {
      if (isBackPaginating || !client || !roomId) return;
      const room = client.getRoom(roomId);
      if (!room) return;
      if (from.getTime() > to.getTime()) return;

      setDateRange({ from, to });
      setIsBackPaginating(true);
      try {
        const fromTs = from.getTime();
        while (true) {
          const events = room.getLiveTimeline().getEvents();
          const oldest = events[0];
          const token = room.getLiveTimeline().getPaginationToken(Direction.Backward);
          if (!token) break;
          if (oldest?.getTs() != null && oldest.getTs() <= fromTs) break;
          await client.scrollback(room, 50);
        }
        bump();
      } catch (err) {
        console.error("Failed to load messages between dates:", err);
      } finally {
        setIsBackPaginating(false);
      }
    },
    [isBackPaginating, client, roomId, bump]
  );

  const clearDateRange = useCallback(() => {
    setDateRange(null);
    bump();
  }, [bump]);

  return {
    entries: getEntries(),
    isBackPaginating,
    canPaginate: canPaginate(),
    loadPreviousMessages,
    loadMessagesToDate,
    loadBetweenDates,
    clearDateRange,
    dateRange,
    scrollRef,
    bump,
  };
}
