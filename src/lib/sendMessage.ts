import { EventType, type MatrixClient } from "matrix-js-sdk";

export function sendWithTimeout(
  client: MatrixClient,
  roomId: string,
  eventType: EventType | string,
  content: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const timer = setTimeout(
      () => resolve({ success: false, error: "Timed out" }),
      timeoutMs,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client.sendEvent as any)(roomId, eventType, content)
      .then(() => {
        clearTimeout(timer);
        resolve({ success: true });
      })
      .catch((err: unknown) => {
        clearTimeout(timer);
        resolve({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  });
}

export async function sendWithFailover(
  clients: MatrixClient[],
  roomId: string,
  eventType: EventType | string,
  content: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ success: boolean; error?: string }> {
  if (clients.length === 0) return { success: false, error: "No clients available" };

  let lastError = "All accounts failed";
  for (const client of clients) {
    const result = await sendWithTimeout(client, roomId, eventType, content, timeoutMs);
    if (result.success) return result;
    if (result.error) lastError = result.error;
  }
  return { success: false, error: lastError };
}
