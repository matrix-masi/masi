import { useEffect, useState, useCallback, useRef } from "react";
import { MatrixEvent } from "matrix-js-sdk";
import { X, Play, Pause, SkipBack, SkipForward, Loader2 } from "lucide-react";
import { useMatrix } from "../contexts/MatrixContext";
import { useSettings } from "../contexts/SettingsContext";
import { parseMatrixToUrl } from "../lib/helpers";
import { fetchMedia } from "../lib/media";

interface PlaylistItem {
  key: string;
  type: "image" | "video" | "text";
  content: Record<string, unknown>;
  body: string;
}

function classifyPlaylistItem(
  content: Record<string, unknown>,
  playlistShowMessages: boolean
): "image" | "video" | "text" | null {
  const msgtype = content.msgtype as string | undefined;
  if (msgtype === "m.image") return "image";
  if (msgtype === "m.video") return "video";
  if (msgtype === "m.text" && playlistShowMessages) return "text";

  // Some clients send media as m.file and rely on MIME type.
  if (msgtype === "m.file") {
    const info = content.info as Record<string, unknown> | undefined;
    const mimetype = info?.mimetype;
    if (typeof mimetype === "string") {
      if (mimetype.startsWith("image/")) return "image";
      if (mimetype.startsWith("video/")) return "video";
    }
  }

  return null;
}

export default function PlaylistViewer() {
  const { client, playlistTarget, closePlaylist } = useMatrix();
  const {
    playlistImageDuration,
    playlistShowMessages,
    playlistMessageDuration,
  } = useSettings();

  const roomId = playlistTarget?.roomId ?? null;

  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [mediaSrc, setMediaSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const prefetchStarted = useRef<Set<number>>(new Set());

  // Resolve playlist items once per roomId (reads directly from room timeline)
  useEffect(() => {
    if (!client || !roomId) {
      setItems([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const room = client.getRoom(roomId);
    if (!room) {
      setItems([]);
      setLoading(false);
      return;
    }

    const events = room.getLiveTimeline().getEvents();
    const messageEvents = events.filter(
      (e) => e.getType() === "m.room.message"
    );

    (async () => {
      const resolved: PlaylistItem[] = [];

      for (const ev of messageEvents) {
        if (cancelled) return;
        const body = (ev.getContent().body as string) || "";
        const link = parseMatrixToUrl(body.trim());
        if (!link?.eventId) continue;

        let target: MatrixEvent | null = null;
        const sourceRoom = client.getRoom(link.roomId);
        const local = sourceRoom?.findEventById(link.eventId);
        if (local) {
          target = local;
        } else {
          try {
            const raw = await client.fetchRoomEvent(link.roomId, link.eventId);
            target = new MatrixEvent(raw);
          } catch {
            continue;
          }
        }

        if (!target) continue;
        if (target.isEncrypted()) {
          try {
            await client.decryptEventIfNeeded(target);
          } catch {
            continue;
          }
        }
        const content = target.getContent() as Record<string, unknown>;
        const type = classifyPlaylistItem(content, playlistShowMessages);
        if (!type) continue;
        resolved.push({
          key: ev.getId() || `item-${resolved.length}`,
          type,
          content,
          body: (content.body as string) || (type === "text" ? "" : type),
        });
      }

      if (!cancelled) {
        setItems(resolved);
        setCurrentIndex(0);
        setPlaying(true);
        prefetchStarted.current.clear();
      }
    })();

    return () => { cancelled = true; };
  }, [client, roomId, playlistShowMessages]);

  // Fetch media for current item and prefetch next
  useEffect(() => {
    if (!client || items.length === 0) {
      setMediaSrc(null);
      return;
    }

    const item = items[currentIndex];
    if (!item) return;

    const prefetchNext = () => {
      if (items.length <= 1) return;
      const nextIdx = (currentIndex + 1) % items.length;
      if (prefetchStarted.current.has(nextIdx)) return;
      const nextItem = items[nextIdx];
      if (!nextItem || nextItem.type === "text") return;
      prefetchStarted.current.add(nextIdx);
      fetchMedia(nextItem.content as never, client);
    };

    if (item.type === "text") {
      setMediaSrc(null);
      setLoading(false);
      prefetchNext();
      return;
    }

    setMediaSrc(null);
    setLoading(true);
    let cancelled = false;

    const info = item.content.info as Record<string, unknown> | undefined;
    const hasThumbnail = !!(info?.thumbnail_url || info?.thumbnail_file);
    const mediaOpts =
      item.type === "image" && hasThumbnail ? { thumbnail: true } : undefined;
    fetchMedia(item.content as never, client, mediaOpts).then((url) => {
      if (!cancelled) {
        setMediaSrc(url);
        setLoading(false);
        prefetchNext();
      }
    });

    return () => { cancelled = true; };
  }, [client, items, currentIndex]);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => (i + 1) % Math.max(items.length, 1));
  }, [items.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => (i - 1 + items.length) % Math.max(items.length, 1));
  }, [items.length]);

  // Auto-advance timer for images and text
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!playing || items.length === 0 || loading) return;
    const item = items[currentIndex];
    if (!item) return;

    if (item.type === "video") return;

    const duration = item.type === "image" ? playlistImageDuration : playlistMessageDuration;
    timerRef.current = setTimeout(goNext, duration * 1000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [playing, currentIndex, items, loading, playlistImageDuration, playlistMessageDuration, goNext]);

  // Keyboard controls
  useEffect(() => {
    if (!playlistTarget) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePlaylist();
      else if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); goNext(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
      else if (e.key === "p" || e.key === "k") setPlaying((p) => !p);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [playlistTarget, closePlaylist, goNext, goPrev]);

  if (!playlistTarget) return null;

  const item = items[currentIndex];

  return (
    <div
      className="fixed inset-0 z-100 flex flex-col bg-black/[.95]"
      onClick={(e) => {
        if (e.target === e.currentTarget) closePlaylist();
      }}
    >
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <span className="text-[0.85rem] text-neutral-400">
          {items.length > 0
            ? `${currentIndex + 1} / ${items.length}`
            : "No items"}
        </span>
        <button
          onClick={closePlaylist}
          className="rounded-sm bg-transparent p-1 text-[1.4rem] text-white transition-colors hover:text-neutral-300"
        >
          <X size={22} />
        </button>
      </div>

      {/* Content area */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-8">
        {items.length === 0 && (
          <p className="text-[1rem] text-neutral-400">
            {loading ? "Loading playlist…" : "No playable items in this list."}
          </p>
        )}

        {item && loading && (
          <Loader2 size={36} className="animate-spin text-neutral-400" />
        )}

        {item && !loading && item.type === "image" && mediaSrc && (
          <img
            src={mediaSrc}
            alt={item.body}
            className="max-h-[80vh] max-w-[90vw] rounded-sm object-contain"
          />
        )}

        {item && !loading && item.type === "video" && mediaSrc && (
          <video
            ref={videoRef}
            src={mediaSrc}
            controls
            autoPlay={playing}
            playsInline
            onEnded={goNext}
            className="max-h-[80vh] max-w-[90vw] rounded-sm bg-black"
          />
        )}

        {item && !loading && item.type === "text" && (
          <div className="max-w-[600px] rounded-[14px] bg-white/10 px-8 py-6">
            <p className="whitespace-pre-wrap text-[1.2rem] leading-[1.6] text-white">
              {item.body}
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex shrink-0 items-center justify-center gap-4 px-4 py-4">
        <button
          onClick={goPrev}
          title="Previous"
          className="rounded-full p-2 text-white transition-colors hover:bg-white/10"
        >
          <SkipBack size={22} />
        </button>
        <button
          onClick={() => setPlaying((p) => !p)}
          title={playing ? "Pause" : "Play"}
          className="rounded-full bg-white/15 p-3 text-white transition-colors hover:bg-white/25"
        >
          {playing ? <Pause size={24} /> : <Play size={24} />}
        </button>
        <button
          onClick={goNext}
          title="Next"
          className="rounded-full p-2 text-white transition-colors hover:bg-white/10"
        >
          <SkipForward size={22} />
        </button>
      </div>

      {/* Progress bar */}
      {items.length > 1 && (
        <div className="flex shrink-0 gap-1 px-4 pb-3">
          {items.map((_, i) => (
            <div
              key={i}
              className={`h-[3px] flex-1 rounded-full transition-colors ${
                i === currentIndex ? "bg-white" : "bg-white/20"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
