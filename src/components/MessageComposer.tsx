import { useState, useRef, useCallback, type FormEvent, type ChangeEvent, type KeyboardEvent } from "react";
import { EventType, MsgType, type MatrixClient } from "matrix-js-sdk";
import { useMatrix } from "../contexts/MatrixContext";
import { useSettings } from "../contexts/SettingsContext";
import { useClientsForRoom } from "../hooks/useRoomList";
import { getImageDimensions, getVideoDimensions } from "../lib/helpers";
import { markdownToMatrixHtml } from "../lib/markdown";

function sendWithTimeout(
  client: MatrixClient,
  roomId: string,
  eventType: EventType,
  content: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ success: boolean }> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ success: false }), timeoutMs);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client.sendEvent as any)(roomId, eventType, content)
      .then(() => {
        clearTimeout(timer);
        resolve({ success: true });
      })
      .catch(() => {
        clearTimeout(timer);
        resolve({ success: false });
      });
  });
}

export default function MessageComposer() {
  const { client, currentRoomId, allSwarmClients } = useMatrix();
  const { sendMarkdown, swarmFailoverTimeout } = useSettings();
  const roomClients = useClientsForRoom(currentRoomId);
  const [message, setMessage] = useState("");
  const [uploadToast, setUploadToast] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getOrderedClients = useCallback((): MatrixClient[] => {
    if (roomClients.length > 0) return roomClients;
    if (allSwarmClients.length > 0) return allSwarmClients;
    return client ? [client] : [];
  }, [roomClients, allSwarmClients, client]);

  const sendWithFailover = useCallback(
    async (
      roomId: string,
      eventType: EventType,
      content: Record<string, unknown>,
    ): Promise<boolean> => {
      const clients = getOrderedClients();
      if (clients.length === 0) return false;

      const timeoutMs = swarmFailoverTimeout * 1000;

      for (const c of clients) {
        const { success } = await sendWithTimeout(
          c,
          roomId,
          eventType,
          content,
          timeoutMs,
        );
        if (success) return true;
      }
      return false;
    },
    [getOrderedClients, swarmFailoverTimeout],
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const body = message.trim();
    if (!body || !currentRoomId) return;
    setMessage("");
    setSendError(null);

    const content: Record<string, unknown> = sendMarkdown
      ? {
          msgtype: MsgType.Text,
          body,
          format: "org.matrix.custom.html",
          formatted_body: markdownToMatrixHtml(body),
        }
      : { msgtype: MsgType.Text, body };

    const ok = await sendWithFailover(
      currentRoomId,
      EventType.RoomMessage,
      content,
    );
    if (!ok) {
      setSendError("Failed to send message. All accounts timed out.");
      setTimeout(() => setSendError(null), 4000);
    }
  };

  const handleTyping = useCallback(() => {
    if (!currentRoomId || !client) return;
    client.sendTyping(currentRoomId, true, 4000).catch(() => {});
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      client.sendTyping(currentRoomId, false, 0).catch(() => {});
    }, 3500);
  }, [client, currentRoomId]);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentRoomId || !client) return;
    if (fileInputRef.current) fileInputRef.current.value = "";

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      alert("Only images and videos are supported.");
      return;
    }

    setUploadToast("Uploading…");

    try {
      const uploadResp = await client.uploadContent(file, {
        name: file.name,
        type: file.type,
        progressHandler: ({ loaded, total }: { loaded: number; total: number }) => {
          const pct = Math.round((loaded / total) * 100);
          setUploadToast(`Uploading… ${pct}%`);
        },
      });

      const mxcUrl = uploadResp.content_uri;

      if (isImage) {
        const info: Record<string, unknown> = {
          mimetype: file.type,
          size: file.size,
        };
        const dims = await getImageDimensions(file);
        if (dims) {
          info.w = dims.width;
          info.h = dims.height;
        }
        await sendWithFailover(currentRoomId, EventType.RoomMessage, {
          msgtype: MsgType.Image,
          body: file.name,
          url: mxcUrl,
          info,
        });
      } else {
        const info: Record<string, unknown> = {
          mimetype: file.type,
          size: file.size,
        };
        const dims = await getVideoDimensions(file);
        if (dims) {
          info.w = dims.width;
          info.h = dims.height;
          info.duration = dims.duration;
        }
        await sendWithFailover(currentRoomId, EventType.RoomMessage, {
          msgtype: MsgType.Video,
          body: file.name,
          url: mxcUrl,
          info,
        });
      }
    } catch (err: unknown) {
      console.error("Upload failed:", err);
      alert("Upload failed: " + (err instanceof Error ? err.message : err));
    } finally {
      setUploadToast(null);
    }
  };

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-border bg-surface px-3 py-2.5"
      >
        <label
          title="Attach file"
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-[1.4rem] text-muted transition-colors hover:bg-surface2"
        >
          ＋
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
        <textarea
          rows={1}
          placeholder="Message…"
          autoComplete="off"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            handleTyping();
          }}
          onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).form?.requestSubmit();
            }
          }}
          className="min-w-0 flex-1 resize-none rounded-sm border border-border bg-background px-3.5 py-2.5 text-[0.9rem] text-foreground outline-none transition-colors focus:border-accent"
        />
        <button
          type="submit"
          title="Send"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-[1.1rem] text-white transition-colors hover:bg-accent-hover"
        >
          ➤
        </button>
      </form>

      {(uploadToast || sendError) && (
        <div
          className={`fixed bottom-[72px] left-1/2 z-50 -translate-x-1/2 rounded-sm border border-border px-5 py-2 text-[0.82rem] ${
            sendError
              ? "bg-danger/20 text-danger border-danger/40"
              : "bg-surface2 text-muted"
          }`}
        >
          {sendError || uploadToast}
        </div>
      )}
    </>
  );
}
