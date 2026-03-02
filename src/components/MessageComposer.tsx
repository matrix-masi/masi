import { useState, useRef, useCallback, type FormEvent, type ChangeEvent } from "react";
import { useMatrix } from "../contexts/MatrixContext";
import { getImageDimensions, getVideoDimensions } from "../lib/helpers";

export default function MessageComposer() {
  const { client, currentRoomId } = useMatrix();
  const [message, setMessage] = useState("");
  const [uploadToast, setUploadToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const body = message.trim();
    if (!body || !currentRoomId || !client) return;
    setMessage("");
    try {
      await client.sendEvent(currentRoomId, "m.room.message", {
        msgtype: "m.text",
        body,
      });
    } catch (err) {
      console.error("Send failed:", err);
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
        await client.sendEvent(currentRoomId, "m.room.message", {
          msgtype: "m.image",
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
        await client.sendEvent(currentRoomId, "m.room.message", {
          msgtype: "m.video",
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
        <input
          type="text"
          placeholder="Message…"
          autoComplete="off"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            handleTyping();
          }}
          className="min-w-0 flex-1 rounded-sm border border-border bg-background px-3.5 py-2.5 text-[0.9rem] text-foreground outline-none transition-colors focus:border-accent"
        />
        <button
          type="submit"
          title="Send"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-[1.1rem] text-white transition-colors hover:bg-accent-hover"
        >
          ➤
        </button>
      </form>

      {uploadToast && (
        <div className="fixed bottom-[72px] left-1/2 z-50 -translate-x-1/2 rounded-sm border border-border bg-surface2 px-5 py-2 text-[0.82rem] text-muted">
          {uploadToast}
        </div>
      )}
    </>
  );
}
