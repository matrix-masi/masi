import { useState, useEffect } from "react";
import type { Room } from "matrix-js-sdk";
import { useMatrix } from "../contexts/MatrixContext";
import { getEventPreview } from "../lib/helpers";
import { fetchAuthenticatedMedia } from "../lib/media";

interface RoomItemProps {
  room: Room;
  active: boolean;
  onSelect: () => void;
}

export default function RoomItem({ room, active, onSelect }: RoomItemProps) {
  const { client } = useMatrix();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const name = room.name || room.roomId;
  const initial = (name || "?")[0].toUpperCase();
  const notif = room.getUnreadNotificationCount("total") || 0;
  const lastEvent = room.timeline[room.timeline.length - 1];
  const preview = lastEvent ? getEventPreview(lastEvent, client) : "";

  useEffect(() => {
    const mxc = room.getMxcAvatarUrl();
    if (!mxc || !client) {
      setAvatarUrl(null);
      return;
    }
    let cancelled = false;
    fetchAuthenticatedMedia(client, mxc, 34, 34, "crop").then((url) => {
      if (!cancelled) setAvatarUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [room, client]);

  return (
    <li
      onClick={onSelect}
      className={`relative flex cursor-pointer items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-surface2 ${active ? "bg-surface2" : ""}`}
    >
      <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-[0.8rem] font-bold text-white">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.85rem] font-medium">{name}</div>
        {preview && (
          <div className="truncate text-[0.75rem] text-muted">{preview}</div>
        )}
      </div>

      {notif > 0 && (
        <div className="flex min-w-[18px] items-center justify-center rounded-full bg-accent px-[5px] py-0 text-[0.65rem] font-bold text-white h-[18px]">
          {notif > 99 ? "99+" : notif}
        </div>
      )}
    </li>
  );
}
