import { useEffect, useRef, useCallback } from "react";
import { RoomEvent, type MatrixEvent as ME } from "matrix-js-sdk";
import { useMatrix } from "../contexts/MatrixContext";
import { useTimeline } from "../hooks/useTimeline";
import HistoryControls from "./HistoryControls";
import Message from "./Message";

export default function Timeline() {
  const { client, currentRoomId, setShowCryptoBanner } = useMatrix();
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
      bottomLockRef.current = true;
      scrollToBottom(true);
    }
  }, [currentRoomId, entries, scrollToBottom]);

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
          return (
            <Message
              key={entry.key}
              event={entry.event}
              latestEdit={entry.latestEdit}
              editHistory={entry.editHistory}
            />
          );
        }
        return null;
      })}
    </div>
  );
}
