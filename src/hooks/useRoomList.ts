import { useMemo } from "react";
import type { Room, MatrixClient } from "matrix-js-sdk";
import { useMatrix } from "../contexts/MatrixContext";

export function useRoomList(filter: string): Room[] {
  const { client, allSwarmClients, roomListVersion } = useMatrix();

  return useMemo(() => {
    void roomListVersion;
    const clients: MatrixClient[] =
      allSwarmClients.length > 0 ? allSwarmClients : client ? [client] : [];
    if (clients.length === 0) return [];

    const seen = new Map<string, Room>();
    for (const c of clients) {
      const rooms = c.getRooms() || [];
      for (const r of rooms) {
        if (r.getMyMembership() !== "join") continue;
        if (!seen.has(r.roomId)) seen.set(r.roomId, r);
      }
    }

    const lower = filter.toLowerCase();
    return Array.from(seen.values())
      .filter((r) => !lower || r.name.toLowerCase().includes(lower))
      .sort((a, b) => {
        const tsA = a.getLastActiveTimestamp() ?? 0;
        const tsB = b.getLastActiveTimestamp() ?? 0;
        return tsB - tsA;
      });
  }, [client, allSwarmClients, filter, roomListVersion]);
}

export function useClientsForRoom(roomId: string | null): MatrixClient[] {
  const { allSwarmClients, roomListVersion } = useMatrix();

  return useMemo(() => {
    void roomListVersion;
    if (!roomId) return [];
    const result: MatrixClient[] = [];
    for (const c of allSwarmClients) {
      const room = c.getRoom(roomId);
      if (room && room.getMyMembership() === "join") result.push(c);
    }
    return result;
  }, [roomId, allSwarmClients, roomListVersion]);
}
