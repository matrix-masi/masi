import { useState, useCallback, useEffect, useRef } from "react";
import { useMatrix } from "../contexts/MatrixContext";
import { useFavourites } from "../hooks/useFavourites";
import ChatHeader from "./ChatHeader";
import CryptoBanner from "./CryptoBanner";
import Timeline from "./Timeline";
import FavouritesTimeline from "./FavouritesTimeline";
import TypingIndicator from "./TypingIndicator";
import MessageComposer from "./MessageComposer";
import AddToFavouritesModal from "./AddToFavouritesModal";

interface ChatAreaProps {
  onOpenSidebar: () => void;
}

export default function ChatArea({ onOpenSidebar }: ChatAreaProps) {
  const { client, currentRoomId, setCurrentRoomId } = useMatrix();
  const { isFavouritesRoom } = useFavourites();
  const isFav = isFavouritesRoom(currentRoomId);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [showAddToFavs, setShowAddToFavs] = useState(false);
  const deletingRef = useRef(false);

  useEffect(() => {
    setSelectMode(false);
    setSelectedEventIds(new Set());
  }, [currentRoomId]);

  const toggleEventSelection = useCallback((eventId: string) => {
    setSelectedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedEventIds(new Set());
  }, []);

  const deleteFromFavourites = useCallback(async () => {
    if (!client || !currentRoomId || selectedEventIds.size === 0 || deletingRef.current) return;
    deletingRef.current = true;
    try {
      for (const eventId of selectedEventIds) {
        await client.redactEvent(currentRoomId, eventId);
      }
    } catch (err) {
      console.error("Failed to delete from favourites:", err);
    } finally {
      deletingRef.current = false;
      exitSelectMode();
    }
  }, [client, currentRoomId, selectedEventIds, exitSelectMode]);

  const leaveCurrentRoom = useCallback(async () => {
    if (!client || !currentRoomId) return;
    const roomIdToLeave = currentRoomId;
    try {
      await client.leave(roomIdToLeave);
      setCurrentRoomId(null);
    } catch (err) {
      console.error("Failed to leave room:", err);
    }
  }, [client, currentRoomId, setCurrentRoomId]);

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <ChatHeader
        onOpenSidebar={onOpenSidebar}
        isFavouritesRoom={isFav}
        selectMode={selectMode}
        hasSelection={selectedEventIds.size > 0}
        onToggleSelectMode={() => {
          if (selectMode) exitSelectMode();
          else setSelectMode(true);
        }}
        onOpenAddToFavourites={() => setShowAddToFavs(true)}
        onDeleteFromFavourites={deleteFromFavourites}
        onDeleteFavouritesList={leaveCurrentRoom}
        onLeaveRoom={leaveCurrentRoom}
      />
      <CryptoBanner />
      {isFav ? (
        <FavouritesTimeline
          selectMode={selectMode}
          selectedEventIds={selectedEventIds}
          toggleEventSelection={toggleEventSelection}
        />
      ) : (
        <Timeline
          selectMode={selectMode}
          selectedEventIds={selectedEventIds}
          toggleEventSelection={toggleEventSelection}
        />
      )}
      {!isFav && <TypingIndicator />}
      {!isFav && currentRoomId && <MessageComposer />}
      {showAddToFavs && currentRoomId && (
        <AddToFavouritesModal
          sourceRoomId={currentRoomId}
          selectedEventIds={selectedEventIds}
          onClose={() => {
            setShowAddToFavs(false);
            exitSelectMode();
          }}
        />
      )}
    </main>
  );
}
