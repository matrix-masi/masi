import { useMemo, useCallback } from "react";
import type { Room } from "matrix-js-sdk";
import { Visibility, Preset } from "matrix-js-sdk";
import { useMatrix } from "../contexts/MatrixContext";

const FAVOURITES_PREFIX = "Favourites: ";

export function isFavouritesRoomName(name: string): boolean {
  return name.startsWith(FAVOURITES_PREFIX);
}

export function getFavouritesListName(room: Room): string {
  return room.name.slice(FAVOURITES_PREFIX.length);
}

export function useFavourites(filter = "") {
  const { client, roomListVersion } = useMatrix();

  const { favouriteRooms, regularRooms } = useMemo(() => {
    void roomListVersion;
    if (!client) return { favouriteRooms: [] as Room[], regularRooms: [] as Room[] };
    const rooms = client.getRooms() || [];
    const lower = filter.toLowerCase();
    const joined = rooms
      .filter((r) => r.getMyMembership() === "join")
      .filter((r) => !lower || r.name.toLowerCase().includes(lower));

    const favs: Room[] = [];
    const regular: Room[] = [];
    for (const r of joined) {
      if (isFavouritesRoomName(r.name)) {
        favs.push(r);
      } else {
        regular.push(r);
      }
    }

    const byActivity = (a: Room, b: Room) => {
      const tsA = a.getLastActiveTimestamp() ?? 0;
      const tsB = b.getLastActiveTimestamp() ?? 0;
      return tsB - tsA;
    };
    favs.sort(byActivity);
    regular.sort(byActivity);

    return { favouriteRooms: favs, regularRooms: regular };
  }, [client, filter, roomListVersion]);

  const isFavouritesRoom = useCallback(
    (roomId: string | null): boolean => {
      if (!roomId || !client) return false;
      const room = client.getRoom(roomId);
      return !!room && isFavouritesRoomName(room.name);
    },
    [client]
  );

  const createFavouritesList = useCallback(
    async (name: string): Promise<string> => {
      if (!client) throw new Error("Client not initialized");
      const resp = await client.createRoom({
        name: `${FAVOURITES_PREFIX}${name}`,
        visibility: Visibility.Private,
        preset: Preset.PrivateChat,
        invite: [],
      });
      return resp.room_id;
    },
    [client]
  );

  return { favouriteRooms, regularRooms, isFavouritesRoom, createFavouritesList };
}
