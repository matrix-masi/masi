import { CheckSquare, Star, Trash2, Play, X } from "lucide-react";
import { useMatrix } from "../contexts/MatrixContext";
import { getFavouritesListName } from "../hooks/useFavourites";

interface ChatHeaderProps {
  onOpenSidebar: () => void;
  isFavouritesRoom: boolean;
  selectMode: boolean;
  hasSelection: boolean;
  onToggleSelectMode: () => void;
  onOpenAddToFavourites: () => void;
  onDeleteFromFavourites?: () => void;
}

export default function ChatHeader({
  onOpenSidebar,
  isFavouritesRoom,
  selectMode,
  hasSelection,
  onToggleSelectMode,
  onOpenAddToFavourites,
  onDeleteFromFavourites,
}: ChatHeaderProps) {
  const { client, currentRoomId, openPlaylist } = useMatrix();

  const room = currentRoomId ? client?.getRoom(currentRoomId) : null;
  const rawName = room?.name || currentRoomId || "Select a room";
  const name = isFavouritesRoom && room ? getFavouritesListName(room) : rawName;

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
        </div>
      )}
    </header>
  );
}
