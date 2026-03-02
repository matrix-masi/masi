import { useState, useEffect } from "react";
import { MatrixEventEvent, type MatrixEvent } from "matrix-js-sdk";
import { useMatrix } from "../contexts/MatrixContext";
import { shortName, formatTime, isUndecryptedEvent } from "../lib/helpers";
import { fetchMedia } from "../lib/media";

interface MessageProps {
  event: MatrixEvent;
}

interface MessageContent extends Record<string, unknown> {
  msgtype?: string;
  body?: string;
  url?: string;
  file?: Record<string, unknown>;
  info?: Record<string, unknown>;
}

export default function Message({ event }: MessageProps) {
  const { client, openLightbox } = useMatrix();
  const [content, setContent] = useState<MessageContent>(
    event.getContent() as MessageContent
  );
  const [undecrypted, setUndecrypted] = useState(isUndecryptedEvent(event));
  const [eventType, setEventType] = useState(event.getType());

  useEffect(() => {
    const handler = () => {
      if (!event.isDecryptionFailure()) {
        setContent(event.getContent() as MessageContent);
        setUndecrypted(false);
        setEventType(event.getType());
      }
    };
    event.on(MatrixEventEvent.Decrypted, handler);
    return () => {
      event.removeListener(MatrixEventEvent.Decrypted, handler);
    };
  }, [event]);

  if (eventType !== "m.room.message" && !undecrypted) return null;
  if (eventType === "m.room.message" && !undecrypted && (!content || !content.msgtype))
    return null;

  const isMe = event.getSender() === client?.getUserId();
  const sender = shortName(event.getSender(), client);
  const time = formatTime(event.getDate());

  return (
    <div
      className={`relative max-w-[75%] rounded-[14px] px-3 py-2 text-[0.88rem] leading-[1.45] break-words max-sm:max-w-[88%] ${
        isMe
          ? "self-end rounded-br-[4px] bg-msg-out"
          : "self-start rounded-bl-[4px] bg-msg-in"
      }`}
    >
      {!isMe && (
        <div className="mb-0.5 text-[0.72rem] font-semibold text-accent">
          {sender}
        </div>
      )}

      <div
        className={
          undecrypted
            ? "flex items-center gap-1.5 italic text-muted"
            : ""
        }
      >
        {undecrypted ? (
          <>
            <span className="not-italic">🔒</span> Unable to decrypt
          </>
        ) : (
          <MessageBody content={content} openLightbox={openLightbox} />
        )}
      </div>

      <div className="mt-0.5 text-right text-[0.65rem] text-muted">{time}</div>
    </div>
  );
}

interface MessageBodyProps {
  content: MessageContent;
  openLightbox: (
    type: "image" | "video",
    content: Record<string, unknown>
  ) => void;
}

function MessageBody({ content, openLightbox }: MessageBodyProps) {
  switch (content.msgtype) {
    case "m.image":
      return <ImageContent content={content} openLightbox={openLightbox} />;
    case "m.video":
      return <VideoContent content={content} openLightbox={openLightbox} />;
    default:
      return <>{(content.body as string) || ""}</>;
  }
}

function ImageContent({
  content,
  openLightbox,
}: MessageBodyProps) {
  const { client } = useMatrix();
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    const mediaUrl = content.url || (content.file as Record<string, unknown>)?.url;
    if (!mediaUrl) return;
    const info = content.info as Record<string, unknown> | undefined;
    const hasThumbnail = !!(info?.thumbnail_url || info?.thumbnail_file);
    fetchMedia(content as never, client, { thumbnail: hasThumbnail }).then(
      (url) => {
        if (url) setSrc(url);
      }
    );
  }, [client, content]);

  if (!src) return <>{(content.body as string) || "[image]"}</>;

  return (
    <img
      src={src}
      alt={(content.body as string) || "image"}
      loading="lazy"
      onClick={() => openLightbox("image", content)}
      className="mt-1 block max-h-[300px] max-w-full cursor-pointer rounded-sm"
    />
  );
}

function VideoContent({
  content,
  openLightbox,
}: MessageBodyProps) {
  const { client } = useMatrix();
  const [src, setSrc] = useState<string | null>(null);
  const [poster, setPoster] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    const mediaUrl = content.url || (content.file as Record<string, unknown>)?.url;
    if (!mediaUrl) return;
    fetchMedia(content as never, client).then((url) => {
      if (url) setSrc(url);
    });
    const info = content.info as Record<string, unknown> | undefined;
    const hasThumbnail = !!(info?.thumbnail_url || info?.thumbnail_file);
    if (hasThumbnail) {
      fetchMedia(content as never, client, { thumbnail: true }).then((url) => {
        if (url) setPoster(url);
      });
    }
  }, [client, content]);

  if (!src) return <>{(content.body as string) || "[video]"}</>;

  return (
    <video
      src={src}
      poster={poster || undefined}
      controls
      preload="metadata"
      playsInline
      onDoubleClick={(e) => {
        e.preventDefault();
        openLightbox("video", content);
      }}
      className="mt-1 block max-h-[300px] max-w-full rounded-sm bg-black"
    />
  );
}
