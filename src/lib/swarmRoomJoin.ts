import type { MatrixClient } from "matrix-js-sdk";

const STAGGER_DELAY_MS = 500;

export interface SwarmJoinResult {
  accountUserId: string;
  success: boolean;
  error?: string;
}

export async function joinRoomWithSwarm(
  roomIdOrAlias: string,
  clients: MatrixClient[],
): Promise<SwarmJoinResult[]> {
  if (clients.length === 0) return [];

  const results: SwarmJoinResult[] = [];

  const primary = clients[0];
  try {
    await primary.joinRoom(roomIdOrAlias);
    results.push({
      accountUserId: primary.getUserId() || "unknown",
      success: true,
    });
  } catch (err) {
    results.push({
      accountUserId: primary.getUserId() || "unknown",
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
    return results;
  }

  for (let i = 1; i < clients.length; i++) {
    await new Promise((r) => setTimeout(r, STAGGER_DELAY_MS));
    const c = clients[i];
    try {
      await c.joinRoom(roomIdOrAlias);
      results.push({
        accountUserId: c.getUserId() || "unknown",
        success: true,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `Secondary swarm account ${c.getUserId()} failed to join ${roomIdOrAlias}: ${msg}`,
      );
      results.push({
        accountUserId: c.getUserId() || "unknown",
        success: false,
        error: msg,
      });
    }
  }

  return results;
}

export async function leaveRoomWithSwarm(
  roomId: string,
  clients: MatrixClient[],
): Promise<void> {
  for (const c of clients) {
    try {
      const room = c.getRoom(roomId);
      if (room && room.getMyMembership() === "join") {
        await c.leave(roomId);
      }
    } catch (err) {
      console.warn(
        `Failed to leave room ${roomId} for ${c.getUserId()}:`,
        err,
      );
    }
  }
}
