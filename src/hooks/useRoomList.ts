import { useMemo } from "react";
import type { Room } from "matrix-js-sdk";
import { useMatrix } from "../contexts/MatrixContext";

export function useRoomList(filter: string): Room[] {
  const { client, roomListVersion } = useMatrix();

  return useMemo(() => {
    void roomListVersion;
    if (!client) return [];
    const rooms = client.getRooms() || [];
    const lower = filter.toLowerCase();
    return rooms
      .filter((r) => r.getMyMembership() === "join")
      .filter((r) => !lower || r.name.toLowerCase().includes(lower))
      .sort((a, b) => {
        const tsA = a.getLastActiveTimestamp() ?? 0;
        const tsB = b.getLastActiveTimestamp() ?? 0;
        return tsB - tsA;
      });
  }, [client, filter, roomListVersion]);
}
