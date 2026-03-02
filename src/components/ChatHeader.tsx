import { useMatrix } from "../contexts/MatrixContext";

interface ChatHeaderProps {
  onOpenSidebar: () => void;
}

export default function ChatHeader({ onOpenSidebar }: ChatHeaderProps) {
  const { client, currentRoomId } = useMatrix();

  const room = currentRoomId ? client?.getRoom(currentRoomId) : null;
  const name = room?.name || currentRoomId || "Select a room";

  return (
    <header className="flex items-center gap-2.5 border-b border-border bg-surface px-4 py-3 text-[0.95rem] font-semibold">
      <button
        onClick={onOpenSidebar}
        title="Rooms"
        className="hidden rounded-sm bg-transparent px-1.5 py-0.5 text-[1.3rem] text-foreground max-sm:block"
      >
        ☰
      </button>
      <span className="truncate">{name}</span>
    </header>
  );
}
