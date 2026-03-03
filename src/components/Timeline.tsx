import { useEffect, useRef, useCallback } from "react";
import { RoomEvent, Direction, type MatrixEvent as ME } from "matrix-js-sdk";
import { useMatrix } from "../contexts/MatrixContext";
import { useTimeline } from "../hooks/useTimeline";
import HistoryControls from "./HistoryControls";
import Message from "./Message";

interface TimelineProps {
  selectMode: boolean;
  selectedEventIds: Set<string>;
  toggleEventSelection: (eventId: string) => void;
}

export default function Timeline({ selectMode, selectedEventIds, toggleEventSelection }: TimelineProps) {
  const { client, currentRoomId, setShowCryptoBanner, targetEventId, setTargetEventId } = useMatrix();
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
  const paginatingToEventRef = useRef(false);

  const scrollToBottom = useCallback((instant = false) => {
    requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el) return;
      el.scrollTo({
        top: el.scrollHeight,
        behavior: instant ? "instant" : "smooth",
      });
    });
  }, []);

  useEffect(() => {
    if (currentRoomId !== prevRoomRef.current) {
      prevRoomRef.current = currentRoomId;
      if (targetEventId) {
        bottomLockRef.current = false;
      } else {
        bottomLockRef.current = true;
        scrollToBottom(true);
      }
    }
  }, [currentRoomId, entries, scrollToBottom, targetEventId]);

  useEffect(() => {
    if (!client || !currentRoomId) return;
    const handler = (event: ME, room: { roomId: string } | undefined, toStart: boolean | undefined) => {
      if (!toStart && room?.roomId === currentRoomId) {
        bump();
        if (bottomLockRef.current) scrollToBottom();
      }
    };
    client.on(RoomEvent.Timeline, handler);
    return () => {
      client.removeListener(RoomEvent.Timeline, handler);
    };
  }, [client, currentRoomId, bump, scrollToBottom]);

  useEffect(() => {
    const hasUndecrypted = entries.some(
      (e) =>
        e.type === "event" &&
        e.event &&
        (e.event.getType() === "m.room.encrypted" || e.event.isDecryptionFailure())
    );
    if (hasUndecrypted) setShowCryptoBanner(true);
  }, [entries, setShowCryptoBanner]);

  useEffect(() => {
    if (!targetEventId) return;

    const hasEvent = entries.some(
      (e) => e.type === "event" && e.event?.getId() === targetEventId
    );

    if (hasEvent) {
      requestAnimationFrame(() => {
        const el = containerRef.current?.querySelector(
          `[data-event-id="${targetEventId}"]`
        );
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("highlight-message");
          setTimeout(() => el.classList.remove("highlight-message"), 2000);
        }
        setTargetEventId(null);
      });
      return;
    }

    if (paginatingToEventRef.current) return;
    if (!client || !currentRoomId) {
      setTargetEventId(null);
      return;
    }

    const room = client.getRoom(currentRoomId);
    if (!room) {
      setTargetEventId(null);
      return;
    }

    paginatingToEventRef.current = true;
    (async () => {
      try {
        for (let i = 0; i < 20; i++) {
          const token = room
            .getLiveTimeline()
            .getPaginationToken(Direction.Backward);
          if (!token) break;
          await client.scrollback(room, 50);
          if (room.getLiveTimeline().getEvents().some((e) => e.getId() === targetEventId)) {
            bump();
            return;
          }
        }
        setTargetEventId(null);
      } finally {
        paginatingToEventRef.current = false;
      }
    })();
  }, [targetEventId, entries, client, currentRoomId, bump, setTargetEventId]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    bottomLockRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 40;
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

      {entries.map((entry) => {
        if (entry.type === "date") {
          return (
            <div
              key={entry.key}
              className="py-3 pb-1 text-center text-[0.72rem] text-muted"
            >
              {entry.dateStr}
            </div>
          );
        }
        if (entry.event) {
          const eventId = entry.event.getId() || "";
          return (
            <Message
              key={entry.key}
              event={entry.event}
              latestEdit={entry.latestEdit}
              editHistory={entry.editHistory}
              selectMode={selectMode}
              isSelected={selectedEventIds.has(eventId)}
              onToggleSelect={() => toggleEventSelection(eventId)}
            />
          );
        }
        return null;
      })}
    </div>
  );
}
