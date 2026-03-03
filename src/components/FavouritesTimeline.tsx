import { useEffect, useRef, useState, useCallback } from "react";
import { RoomEvent, MatrixEvent, type MatrixEvent as ME } from "matrix-js-sdk";
import { Loader2, LinkIcon } from "lucide-react";
import { useMatrix } from "../contexts/MatrixContext";
import { useTimeline } from "../hooks/useTimeline";
import { parseMatrixToUrl, isUndecryptedEvent } from "../lib/helpers";
import HistoryControls from "./HistoryControls";
import Message from "./Message";

interface ResolvedEntry {
  key: string;
  sourceEvent: ME;
  resolvedEvent: ME | null;
  loading: boolean;
  error: boolean;
}

interface FavouritesTimelineProps {
  selectMode: boolean;
  selectedEventIds: Set<string>;
  toggleEventSelection: (eventId: string) => void;
}

export default function FavouritesTimeline({ selectMode, selectedEventIds, toggleEventSelection }: FavouritesTimelineProps) {
  const { client, currentRoomId } = useMatrix();
  const {
    entries,
    isBackPaginating,
    canPaginate,
    loadPreviousMessages,
    loadMessagesToDate,
    bump,
  } = useTimeline(client, currentRoomId);

  const containerRef = useRef<HTMLDivElement>(null);
  const prevRoomRef = useRef<string | null>(null);
  const bottomLockRef = useRef(true);
  const resolvedCacheRef = useRef(new Map<string, ME>());

  const [resolved, setResolved] = useState<ResolvedEntry[]>([]);

  const scrollToBottom = useCallback((instant = false) => {
    requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: instant ? "instant" : "smooth" });
    });
  }, []);

  useEffect(() => {
    if (currentRoomId !== prevRoomRef.current) {
      prevRoomRef.current = currentRoomId;
      bottomLockRef.current = true;
      scrollToBottom(true);
    }
  }, [currentRoomId, entries, scrollToBottom]);

  useEffect(() => {
    if (!client || !currentRoomId) return;
    const handler = (_event: ME, room: { roomId: string } | undefined, toStart: boolean | undefined) => {
      if (!toStart && room?.roomId === currentRoomId) {
        bump();
        if (bottomLockRef.current) scrollToBottom();
      }
    };
    client.on(RoomEvent.Timeline, handler);
    return () => { client.removeListener(RoomEvent.Timeline, handler); };
  }, [client, currentRoomId, bump, scrollToBottom]);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;

    const messageEntries = entries.filter(
      (e) => e.type === "event" && e.event && e.event.getType() === "m.room.message"
    );

    const needsDecryption: { cacheKey: string; event: ME }[] = [];

    const batch: ResolvedEntry[] = messageEntries.map((entry) => {
      const ev = entry.event!;
      const body = (ev.getContent().body as string) || "";
      const link = parseMatrixToUrl(body.trim());
      const cacheKey = link?.eventId ? `${link.roomId}/${link.eventId}` : "";

      if (!link?.eventId) {
        return { key: entry.key, sourceEvent: ev, resolvedEvent: null, loading: false, error: true };
      }

      const cached = resolvedCacheRef.current.get(cacheKey);
      if (cached) {
        if (isUndecryptedEvent(cached)) {
          needsDecryption.push({ cacheKey, event: cached });
        }
        return { key: entry.key, sourceEvent: ev, resolvedEvent: cached, loading: false, error: false };
      }

      return { key: entry.key, sourceEvent: ev, resolvedEvent: null, loading: true, error: false };
    });

    setResolved(batch);

    const toResolve = batch.filter((b) => b.loading);

    (async () => {
      for (const item of toResolve) {
        if (cancelled) return;
        const body = (item.sourceEvent.getContent().body as string) || "";
        const link = parseMatrixToUrl(body.trim());
        if (!link?.eventId) continue;

        const cacheKey = `${link.roomId}/${link.eventId}`;
        let resolved: ME | null = null;

        const sourceRoom = client.getRoom(link.roomId);
        const localEvent = sourceRoom?.findEventById(link.eventId);
        if (localEvent) {
          resolved = localEvent;
        } else {
          try {
            const raw = await client.fetchRoomEvent(link.roomId, link.eventId);
            resolved = new MatrixEvent(raw);
          } catch {
            // Event not accessible
          }
        }

        if (resolved) {
          if (resolved.isEncrypted()) {
            try {
              await client.decryptEventIfNeeded(resolved);
            } catch {
              // Keys may not be available yet
            }
          }
          resolvedCacheRef.current.set(cacheKey, resolved);
        }
        if (cancelled) return;

        setResolved((prev) =>
          prev.map((p) =>
            p.key === item.key
              ? { ...p, resolvedEvent: resolved, loading: false, error: !resolved }
              : p
          )
        );
      }

      if (cancelled) return;

      for (const { event } of needsDecryption) {
        if (cancelled) return;
        try {
          await client.decryptEventIfNeeded(event);
        } catch {
          // Keys may not be available yet
        }
      }
    })();

    return () => { cancelled = true; };
  }, [client, entries]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    bottomLockRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-4 py-3"
    >
      <HistoryControls
        canPaginate={canPaginate}
        isLoading={isBackPaginating}
        onLoadMore={() => loadPreviousMessages()}
        onLoadToDate={loadMessagesToDate}
      />

      {resolved.map((item) => {
        if (item.loading) {
          return (
            <div key={item.key} className="flex items-center gap-2 self-start rounded-[14px] bg-msg-in px-4 py-3 text-[0.85rem] text-muted">
              <Loader2 size={16} className="animate-spin" />
              <span>Loading…</span>
            </div>
          );
        }
        if (item.error || !item.resolvedEvent) {
          const body = (item.sourceEvent.getContent().body as string) || "";
          return (
            <div key={item.key} className="flex items-center gap-2 self-start rounded-[14px] bg-msg-in px-4 py-3 text-[0.85rem] text-muted">
              <LinkIcon size={14} />
              <span className="truncate max-w-[300px]">{body}</span>
            </div>
          );
        }
        const sourceId = item.sourceEvent.getId() || "";
        const isSelected = selectedEventIds.has(sourceId);
        return (
          <div
            key={item.key}
            className={`flex w-full flex-col rounded-md transition-colors ${
              selectMode ? "cursor-pointer hover:bg-surface2/80" : ""
            }`}
            onClick={selectMode ? () => toggleEventSelection(sourceId) : undefined}
          >
            <Message
              event={item.resolvedEvent}
              selectMode={selectMode}
              isSelected={isSelected}
            />
          </div>
        );
      })}
    </div>
  );
}
