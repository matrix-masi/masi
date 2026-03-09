import { useState, useEffect } from "react";
import { Settings, Plus, Play } from "lucide-react";
import { useMatrix } from "../contexts/MatrixContext";
import { useFavourites, getFavouritesListName } from "../hooks/useFavourites";
import RoomItem from "./RoomItem";
import SettingsModal from "./SettingsModal";
import CreateFavouritesListModal from "./CreateFavouritesListModal";
import ServerRoomSearchModal from "./ServerRoomSearchModal";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { client, logout, syncState, currentRoomId, setCurrentRoomId, openPlaylist } =
    useMatrix();
  const [filter, setFilter] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showCreateList, setShowCreateList] = useState(false);
  const [showServerRoomSearch, setShowServerRoomSearch] = useState(false);
  const { favouriteRooms, regularRooms } = useFavourites(filter);

  useEffect(() => {
    if (!client) return;
    const userId = client.getUserId();
    if (!userId) return;
    client
      .getProfileInfo(userId)
      .then((p) => setDisplayName(p.displayname || userId))
      .catch(() => setDisplayName(userId));
  }, [client]);

  const syncing = syncState !== "PREPARED" && syncState !== "SYNCING";

  const selectRoom = (roomId: string) => {
    setCurrentRoomId(roomId);
    onClose();
  };

  return (
    <aside
      className={`
        flex w-[280px] min-w-[280px] flex-col overflow-hidden border-r border-border bg-surface
        max-sm:fixed max-sm:inset-y-0 max-sm:left-0 max-sm:z-10 max-sm:transition-transform max-sm:duration-200 max-sm:ease-out
        ${open ? "max-sm:translate-x-0" : "max-sm:-translate-x-full"}
      `}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="truncate text-[0.9rem] font-semibold">
          {displayName}
        </span>
        <button
          onClick={() => setShowSettings(true)}
          title="Settings"
          className="rounded-sm p-1.5 text-muted transition-colors hover:text-foreground"
        >
          <Settings size={20} strokeWidth={2} />
        </button>
      </div>

      <div className="mx-3 my-2 flex items-center gap-1.5">
        <input
          type="text"
          placeholder="Search rooms…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 min-w-0 rounded-sm border border-border bg-background px-3.5 py-2.5 text-[0.9rem] text-foreground outline-none transition-colors focus:border-accent"
        />
        <button
          onClick={() => setShowServerRoomSearch(true)}
          title="Discover rooms"
          className="shrink-0 rounded-sm p-2.5 text-muted transition-colors hover:bg-surface2 hover:text-foreground"
        >
          <Plus size={18} strokeWidth={2} />
        </button>
      </div>

      {syncing ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-[0.84rem] text-muted">
          <div className="h-7 w-7 animate-spin rounded-full border-3 border-border border-t-accent" />
          <span>Syncing rooms…</span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {favouriteRooms.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-4 pt-3 pb-1">
                <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted">
                  Favourites
                </span>
                <button
                  onClick={() => setShowCreateList(true)}
                  title="Create favourites list"
                  className="rounded-sm p-0.5 text-muted transition-colors hover:text-foreground"
                >
                  <Plus size={15} strokeWidth={2.5} />
                </button>
              </div>
              <ul className="list-none">
                {favouriteRooms.map((room) => (
                  <li key={room.roomId} className="relative flex items-center">
                    <div className="min-w-0 flex-1">
                      <RoomItem
                        room={room}
                        active={room.roomId === currentRoomId}
                        onSelect={() => selectRoom(room.roomId)}
                        displayName={getFavouritesListName(room)}
                      />
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openPlaylist(room.roomId);
                      }}
                      title="Play"
                      className="mr-2 shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-surface2 hover:text-accent"
                    >
                      <Play size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            {favouriteRooms.length > 0 && (
              <div className="flex items-center px-4 pt-3 pb-1">
                <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted">
                  Rooms
                </span>
              </div>
            )}
            {favouriteRooms.length === 0 && (
              <div className="flex items-center justify-end px-4 pt-2 pb-1">
                <button
                  onClick={() => setShowCreateList(true)}
                  title="Create favourites list"
                  className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[0.7rem] text-muted transition-colors hover:text-foreground"
                >
                  <Plus size={13} strokeWidth={2.5} />
                  <span>Favourites</span>
                </button>
              </div>
            )}
            <ul className="list-none">
              {regularRooms.map((room) => (
                <RoomItem
                  key={room.roomId}
                  room={room}
                  active={room.roomId === currentRoomId}
                  onSelect={() => selectRoom(room.roomId)}
                />
              ))}
            </ul>
          </div>
        </div>
      )}
      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onLogout={logout}
      />
      {showCreateList && (
        <CreateFavouritesListModal onClose={() => setShowCreateList(false)} />
      )}
      <ServerRoomSearchModal
        open={showServerRoomSearch}
        onClose={() => setShowServerRoomSearch(false)}
      />
    </aside>
  );
}
