import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { useMatrix } from "../contexts/MatrixContext";
import { useSwarm } from "../contexts/SwarmContext";

interface SwarmSelectorProps {
  roomId: string;
}

export default function SwarmSelector({ roomId }: SwarmSelectorProps) {
  const { sendingSwarmId, setSendingSwarmId } = useMatrix();
  const { swarms, activeSwarmId, clients, unlockedSwarms } = useSwarm();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const swarmsInRoom = swarms.filter((s) => {
    if (!unlockedSwarms.has(s.id)) return false;
    return s.accounts.some((acc) => {
      const c = clients.get(acc.id);
      if (!c) return false;
      const room = c.getRoom(roomId);
      return room && room.getMyMembership() === "join";
    });
  });

  if (swarmsInRoom.length <= 1) return null;

  const currentId = sendingSwarmId ?? activeSwarmId;
  const currentSwarm = swarmsInRoom.find((s) => s.id === currentId) ?? swarmsInRoom[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-sm border border-border bg-surface2 px-2 py-1.5 text-[0.78rem] text-muted transition-colors hover:text-foreground"
        title="Select sending swarm"
      >
        <span className="max-w-[100px] truncate">{currentSwarm.name}</span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 min-w-[140px] rounded-sm border border-border bg-surface shadow-lg">
          {swarmsInRoom.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSendingSwarmId(s.id);
                setOpen(false);
              }}
              className={`flex w-full items-center px-3 py-2 text-left text-[0.82rem] transition-colors hover:bg-surface2 ${
                s.id === currentId ? "text-accent font-semibold" : "text-foreground"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
