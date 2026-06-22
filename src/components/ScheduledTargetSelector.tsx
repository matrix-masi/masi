import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Room } from "matrix-js-sdk";
import { useMatrix } from "../contexts/MatrixContext";
import { fetchAuthenticatedMedia } from "../lib/media";

interface ScheduledTargetSelectorProps {
  rooms: Room[];
  value: string;
  onChange: (value: string, targetRoomId?: string) => void;
}

interface RoomOption {
  room: Room;
  label: string;
  detail?: string;
}

interface SpaceGroup {
  space: Room;
  rooms: RoomOption[];
}

function roomName(room: Room): string {
  return room.name || room.roomId;
}

function isSpaceRoom(room: Room): boolean {
  const createEvent = room.currentState.getStateEvents("m.room.create", "");
  const content = createEvent?.getContent() as Record<string, unknown> | undefined;
  return content?.type === "m.space";
}

function getSpaceChildRoomIds(space: Room): Set<string> {
  const events = space.currentState.getStateEvents("m.space.child");
  return new Set(
    events
      .map((event) => event.getStateKey())
      .filter((roomId): roomId is string => !!roomId && roomId.startsWith("!")),
  );
}

function getDirectUserLabel(room: Room): string | null {
  const members = room.currentState
    .getMembers()
    .filter((member) => member.membership === "join");
  if (members.length > 2) return null;

  const currentUserId = room.client.getUserId();
  const other = members.find((member) => member.userId !== currentUserId);
  if (!other) return null;
  return other.name || other.userId;
}

function buildRoomSections(rooms: Room[]): {
  spaces: SpaceGroup[];
  users: RoomOption[];
  otherRooms: RoomOption[];
} {
  const spaces = rooms.filter(isSpaceRoom);
  const regularRooms = rooms.filter((room) => !isSpaceRoom(room));
  const roomById = new Map(regularRooms.map((room) => [room.roomId, room]));
  const groupedRoomIds = new Set<string>();

  const spaceGroups = spaces
    .map((space) => {
      const childIds = getSpaceChildRoomIds(space);
      const childRooms = Array.from(childIds)
        .map((roomId) => roomById.get(roomId))
        .filter((room): room is Room => !!room)
        .sort((a, b) => roomName(a).localeCompare(roomName(b)));

      for (const room of childRooms) groupedRoomIds.add(room.roomId);

      return {
        space,
        rooms: childRooms.map((room) => ({
          room,
          label: roomName(room),
        })),
      };
    })
    .filter((group) => group.rooms.length > 0)
    .sort((a, b) => roomName(a.space).localeCompare(roomName(b.space)));

  const users: RoomOption[] = [];
  const otherRooms: RoomOption[] = [];

  for (const room of regularRooms) {
    if (groupedRoomIds.has(room.roomId)) continue;
    const userLabel = getDirectUserLabel(room);
    if (userLabel) {
      users.push({
        room,
        label: userLabel,
        detail: roomName(room) !== userLabel ? roomName(room) : undefined,
      });
    } else {
      otherRooms.push({ room, label: roomName(room) });
    }
  }

  users.sort((a, b) => a.label.localeCompare(b.label));
  otherRooms.sort((a, b) => a.label.localeCompare(b.label));

  return { spaces: spaceGroups, users, otherRooms };
}

function RoomIcon({ room, size = 24 }: { room: Room; size?: number }) {
  const { client } = useMatrix();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const name = roomName(room);
  const initial = (name || "?")[0].toUpperCase();

  useEffect(() => {
    const mxc = room.getMxcAvatarUrl();
    if (!mxc || !client) {
      setAvatarUrl(null);
      return;
    }
    let cancelled = false;
    fetchAuthenticatedMedia(client, mxc, size, size, "crop").then((url) => {
      if (!cancelled) setAvatarUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [room, client, size]);

  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-[0.68rem] font-bold text-white"
      style={{ width: size, height: size }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </div>
  );
}

function RoomButton({
  option,
  active,
  onSelect,
}: {
  option: RoomOption;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-sm px-2.5 py-1.5 text-left transition-colors ${
        active
          ? "bg-accent/15 text-foreground"
          : "text-foreground hover:bg-surface2"
      }`}
    >
      <div className="flex items-center gap-2">
        <RoomIcon room={option.room} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.82rem]">{option.label}</div>
          {option.detail && (
            <div className="truncate text-[0.72rem] text-muted">{option.detail}</div>
          )}
        </div>
      </div>
    </button>
  );
}

function SectionHeader({
  label,
  count,
  expanded,
  onToggle,
  room,
}: {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  room?: Room;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-muted transition-colors hover:bg-surface2 hover:text-foreground"
    >
      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      {room && <RoomIcon room={room} size={22} />}
      <span className="min-w-0 flex-1 truncate text-[0.72rem] font-semibold uppercase tracking-wide">
        {label}
      </span>
      <span className="text-[0.7rem]">{count}</span>
    </button>
  );
}

export default function ScheduledTargetSelector({
  rooms,
  value,
  onChange,
}: ScheduledTargetSelectorProps) {
  const { spaces, users, otherRooms } = useMemo(
    () => buildRoomSections(rooms),
    [rooms],
  );
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(),
  );
  const hasKnownTargets =
    spaces.length > 0 || users.length > 0 || otherRooms.length > 0;

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <label className="block text-[0.8rem] font-medium text-muted">
        Destination room
      </label>
      {hasKnownTargets && (
        <div className="max-h-48 overflow-y-auto rounded-sm border border-border bg-background p-1">
          {spaces.map((group) => {
            const key = `space-${group.space.roomId}`;
            const expanded = expandedSections.has(key);
            return (
              <div key={group.space.roomId} className="mb-1">
                <SectionHeader
                  label={`Space: ${roomName(group.space)}`}
                  count={group.rooms.length}
                  expanded={expanded}
                  onToggle={() => toggleSection(key)}
                  room={group.space}
                />
                {expanded && (
                  <div className="ml-5 mt-0.5 space-y-0.5">
                    {group.rooms.map((option) => (
                      <RoomButton
                        key={option.room.roomId}
                        option={option}
                        active={option.room.roomId === value}
                        onSelect={() => onChange(option.room.roomId, option.room.roomId)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {users.length > 0 && (
            <div className="mb-1">
              <SectionHeader
                label="Users"
                count={users.length}
                expanded={expandedSections.has("users")}
                onToggle={() => toggleSection("users")}
              />
              {expandedSections.has("users") && (
                <div className="ml-5 mt-0.5 space-y-0.5">
                  {users.map((option) => (
                    <RoomButton
                      key={option.room.roomId}
                      option={option}
                      active={option.room.roomId === value}
                      onSelect={() => onChange(option.room.roomId, option.room.roomId)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {otherRooms.length > 0 && (
            <div className="mb-1">
              <SectionHeader
                label="Other rooms"
                count={otherRooms.length}
                expanded={expandedSections.has("other")}
                onToggle={() => toggleSection("other")}
              />
              {expandedSections.has("other") && (
                <div className="ml-5 mt-0.5 space-y-0.5">
                  {otherRooms.map((option) => (
                    <RoomButton
                      key={option.room.roomId}
                      option={option}
                      active={option.room.roomId === value}
                      onSelect={() => onChange(option.room.roomId, option.room.roomId)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Manual: !room:server, #alias:server, or matrix.to URL"
        className="w-full rounded-sm border border-border bg-background px-3 py-2 text-[0.85rem] text-foreground outline-none transition-colors focus:border-accent"
      />
    </div>
  );
}
