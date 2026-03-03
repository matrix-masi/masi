import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Plus } from "lucide-react";
import { EventType, MsgType } from "matrix-js-sdk";
import { useMatrix } from "../contexts/MatrixContext";
import { useFavourites, getFavouritesListName } from "../hooks/useFavourites";
import CreateFavouritesListModal from "./CreateFavouritesListModal";

interface AddToFavouritesModalProps {
  sourceRoomId: string;
  selectedEventIds: Set<string>;
  onClose: () => void;
}

export default function AddToFavouritesModal({
  sourceRoomId,
  selectedEventIds,
  onClose,
}: AddToFavouritesModalProps) {
  const { client } = useMatrix();
  const { favouriteRooms } = useFavourites();
  const [selectedLists, setSelectedLists] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showCreate) setShowCreate(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [onClose, showCreate]);

  const toggleList = (roomId: string) => {
    setSelectedLists((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!client || selectedLists.size === 0 || selectedEventIds.size === 0) return;
    setSubmitting(true);

    const eventIds = Array.from(selectedEventIds);
    const listIds = Array.from(selectedLists);
    let sent = 0;
    const total = eventIds.length * listIds.length;

    try {
      for (const favRoomId of listIds) {
        for (const eventId of eventIds) {
          const matrixToUrl = `https://matrix.to/#/${encodeURIComponent(sourceRoomId)}/${encodeURIComponent(eventId)}`;
          await client.sendEvent(favRoomId, EventType.RoomMessage, {
            msgtype: MsgType.Text,
            body: matrixToUrl,
          });
          sent++;
          setToast(`Adding… ${sent}/${total}`);
        }
      }
      onClose();
    } catch (err) {
      console.error("Failed to add to favourites:", err);
      setToast("Failed to add some items");
      setTimeout(() => setToast(null), 2000);
    } finally {
      setSubmitting(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/75 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[70vh] w-[420px] max-w-full flex-col overflow-hidden rounded-[14px] border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-[1rem] font-semibold">
            Add to Favourites
            <span className="ml-1.5 text-[0.8rem] font-normal text-muted">
              ({selectedEventIds.size} {selectedEventIds.size === 1 ? "message" : "messages"})
            </span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-muted transition-colors hover:text-foreground"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {favouriteRooms.length === 0 && (
            <p className="text-center text-[0.85rem] text-muted py-4">
              No favourites lists yet. Create one below.
            </p>
          )}
          {favouriteRooms.map((room) => {
            const isChecked = selectedLists.has(room.roomId);
            return (
              <button
                key={room.roomId}
                type="button"
                onClick={() => toggleList(room.roomId)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface2"
              >
                <div
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border-2 transition-colors ${
                    isChecked ? "border-accent bg-accent text-white" : "border-muted"
                  }`}
                >
                  {isChecked && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="truncate text-[0.9rem]">{getFavouritesListName(room)}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 text-[0.85rem] text-accent transition-colors hover:text-accent-hover"
          >
            <Plus size={15} />
            New list
          </button>
          <div className="flex items-center gap-2">
            {toast && (
              <span className="text-[0.8rem] text-muted">{toast}</span>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={selectedLists.size === 0 || submitting}
              className="rounded-sm bg-accent px-4 py-1.5 text-[0.85rem] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      </div>

      {showCreate && (
        <CreateFavouritesListModal
          onClose={() => setShowCreate(false)}
          onCreated={(roomId) => {
            setSelectedLists((prev) => new Set(prev).add(roomId));
          }}
        />
      )}
    </div>,
    document.body
  );
}
