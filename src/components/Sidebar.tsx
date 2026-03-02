import { useState, useEffect } from "react";
import { useMatrix } from "../contexts/MatrixContext";
import { useRoomList } from "../hooks/useRoomList";
import RoomItem from "./RoomItem";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { client, logout, syncState, currentRoomId, setCurrentRoomId } =
    useMatrix();
  const [filter, setFilter] = useState("");
  const [displayName, setDisplayName] = useState("");
  const rooms = useRoomList(filter);

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
          onClick={logout}
          title="Logout"
          className="rounded-sm px-1.5 py-1 text-[1.1rem] text-muted transition-colors hover:text-danger"
        >
          ⏻
        </button>
      </div>

      <input
        type="text"
        placeholder="Search rooms…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="mx-3 my-2 w-[calc(100%-1.5rem)] rounded-sm border border-border bg-background px-3.5 py-2.5 text-[0.9rem] text-foreground outline-none transition-colors focus:border-accent"
      />

      {syncing ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-[0.84rem] text-muted">
          <div className="h-7 w-7 animate-spin rounded-full border-3 border-border border-t-accent" />
          <span>Syncing rooms…</span>
        </div>
      ) : (
        <ul className="flex-1 list-none overflow-y-auto">
          {rooms.map((room) => (
            <RoomItem
              key={room.roomId}
              room={room}
              active={room.roomId === currentRoomId}
              onSelect={() => selectRoom(room.roomId)}
            />
          ))}
        </ul>
      )}
    </aside>
  );
}
