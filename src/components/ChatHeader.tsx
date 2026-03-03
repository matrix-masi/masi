import { useState, useRef, useEffect } from "react";
import { CheckSquare, Star, Trash2, Play, X, Settings, CheckCircle } from "lucide-react";
import { useMatrix } from "../contexts/MatrixContext";
import { useSettings } from "../contexts/SettingsContext";
import { getFavouritesListName } from "../hooks/useFavourites";

interface ChatHeaderProps {
  onOpenSidebar: () => void;
  isFavouritesRoom: boolean;
  selectMode: boolean;
  hasSelection: boolean;
  onToggleSelectMode: () => void;
  onOpenAddToFavourites: () => void;
  onDeleteFromFavourites?: () => void;
  onDeleteFavouritesList?: () => void;
  onLeaveRoom?: () => void;
}

export default function ChatHeader({
  onOpenSidebar,
  isFavouritesRoom,
  selectMode,
  hasSelection,
  onToggleSelectMode,
  onOpenAddToFavourites,
  onDeleteFromFavourites,
  onDeleteFavouritesList,
  onLeaveRoom,
}: ChatHeaderProps) {
  const { client, currentRoomId, openPlaylist } = useMatrix();
  const { sendReadReceipts } = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const room = currentRoomId ? client?.getRoom(currentRoomId) : null;
  const rawName = room?.name || currentRoomId || "Select a room";
  const name = isFavouritesRoom && room ? getFavouritesListName(room) : rawName;

  useEffect(() => {
    if (!settingsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [settingsOpen]);

  return (
    <header className="flex items-center gap-2.5 border-b border-border bg-surface px-4 py-3 text-[0.95rem] font-semibold">
      <button
        onClick={onOpenSidebar}
        title="Rooms"
        className="hidden rounded-sm bg-transparent px-1.5 py-0.5 text-[1.3rem] text-foreground max-sm:block"
      >
        ☰
      </button>
      <span className="min-w-0 flex-1 truncate">{name}</span>

      {currentRoomId && !isFavouritesRoom && (
        <div className="flex items-center gap-1">
          {selectMode && hasSelection && (
            <button
              onClick={onOpenAddToFavourites}
              title="Add to favourites"
              className="rounded-sm p-1.5 text-accent transition-colors hover:bg-surface2"
            >
              <Star size={18} />
            </button>
          )}
          <button
            onClick={onToggleSelectMode}
            title={selectMode ? "Exit select mode" : "Select messages"}
            className={`rounded-sm p-1.5 transition-colors hover:bg-surface2 ${
              selectMode ? "text-accent" : "text-muted hover:text-foreground"
            }`}
          >
            {selectMode ? <X size={18} /> : <CheckSquare size={18} />}
          </button>
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setSettingsOpen((o) => !o)}
              title="Room settings"
              className="rounded-sm p-1.5 text-muted transition-colors hover:bg-surface2 hover:text-foreground"
            >
              <Settings size={18} />
            </button>
            {settingsOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 min-w-[10rem] rounded-md border border-border bg-surface py-1 shadow-lg">
                <button
                  onClick={async () => {
                    setSettingsOpen(false);
                    if (!client || !currentRoomId) return;
                    const r = client.getRoom(currentRoomId);
                    if (!r) return;
                    const events = r.getLiveTimeline().getEvents();
                    const lastEvent = events[events.length - 1];
                    const eventId = lastEvent?.getId();
                    if (!eventId) return;
                    try {
                      if (sendReadReceipts) {
                        await client.setRoomReadMarkers(currentRoomId, eventId, lastEvent);
                      } else {
                        await client.setRoomReadMarkers(currentRoomId, eventId);
                      }
                    } catch (err) {
                      console.error("Failed to mark room as read:", err);
                    }
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.9rem] text-foreground transition-colors hover:bg-surface2"
                >
                  <CheckCircle size={16} />
                  Mark all as read
                </button>
                <button
                  onClick={() => {
                    onLeaveRoom?.();
                    setSettingsOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.9rem] text-red-400 transition-colors hover:bg-surface2"
                >
                  <Trash2 size={16} />
                  Leave room
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {currentRoomId && isFavouritesRoom && (
        <div className="flex items-center gap-1">
          {selectMode && hasSelection && (
            <button
              onClick={onDeleteFromFavourites}
              title="Delete selected"
              className="rounded-sm p-1.5 text-red-400 transition-colors hover:bg-surface2"
            >
              <Trash2 size={18} />
            </button>
          )}
          <button
            onClick={onToggleSelectMode}
            title={selectMode ? "Exit select mode" : "Select messages"}
            className={`rounded-sm p-1.5 transition-colors hover:bg-surface2 ${
              selectMode ? "text-accent" : "text-muted hover:text-foreground"
            }`}
          >
            {selectMode ? <X size={18} /> : <CheckSquare size={18} />}
          </button>
          {!selectMode && (
            <button
              onClick={() => openPlaylist(currentRoomId)}
              title="Play"
              className="rounded-sm p-1.5 text-muted transition-colors hover:bg-surface2 hover:text-foreground"
            >
              <Play size={18} />
            </button>
          )}
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setSettingsOpen((o) => !o)}
              title="Favourites settings"
              className="rounded-sm p-1.5 text-muted transition-colors hover:bg-surface2 hover:text-foreground"
            >
              <Settings size={18} />
            </button>
            {settingsOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 min-w-[10rem] rounded-md border border-border bg-surface py-1 shadow-lg">
                <button
                  onClick={() => {
                    onDeleteFavouritesList?.();
                    setSettingsOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.9rem] text-red-400 transition-colors hover:bg-surface2"
                >
                  <Trash2 size={16} />
                  Delete favourites list
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
