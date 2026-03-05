import { Children, isValidElement, useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import type { Element } from "hast";
import { MatrixEventEvent, type MatrixEvent } from "matrix-js-sdk";
import { EyeOff, FileImage, Loader2, Film, X, MessageSquare } from "lucide-react";
import { createPortal } from "react-dom";
import { useMatrix } from "../contexts/MatrixContext";
import { useSettings } from "../contexts/SettingsContext";
import { shortName, formatTime, isUndecryptedEvent, parseMatrixToUrl, type MatrixToLink } from "../lib/helpers";
import { fetchMedia } from "../lib/media";

interface MessageProps {
  event: MatrixEvent;
  latestEdit?: MatrixEvent;
  editHistory?: MatrixEvent[];
  selectMode?: boolean;
  isSelected?: boolean;
}

interface MessageContent extends Record<string, unknown> {
  msgtype?: string;
  body?: string;
  format?: string;
  formatted_body?: string;
  url?: string;
  file?: Record<string, unknown>;
  info?: Record<string, unknown>;
}

function getReplacementContent(event: MatrixEvent): MessageContent | null {
  const content = event.getContent() as Record<string, unknown>;
  const replacement = content["m.new_content"];
  if (!replacement || typeof replacement !== "object") return null;
  return replacement as MessageContent;
}

function getVisibleContent(event: MatrixEvent, latestEdit?: MatrixEvent): MessageContent {
  if (!latestEdit) return event.getContent() as MessageContent;
  return getReplacementContent(latestEdit) || (latestEdit.getContent() as MessageContent);
}

function getHistoryEntries(event: MatrixEvent, editHistory: MatrixEvent[]) {
  const entries = [{ id: event.getId() || "original", event, edited: false }];
  for (const editEvent of editHistory) {
    entries.push({
      id: editEvent.getId() || `edit-${entries.length}`,
      event: editEvent,
      edited: true,
    });
  }
  return entries.sort((a, b) => b.event.getTs() - a.event.getTs());
}

export default function Message({ event, latestEdit, editHistory = [], selectMode, isSelected }: MessageProps) {
  const { client, openLightbox } = useMatrix();
  const [content, setContent] = useState<MessageContent>(getVisibleContent(event, latestEdit));
  const [undecrypted, setUndecrypted] = useState(isUndecryptedEvent(event));
  const [eventType, setEventType] = useState(event.getType());
  const [showHistory, setShowHistory] = useState(false);
  const isEdited = !!latestEdit;

  useEffect(() => {
    setContent(getVisibleContent(event, latestEdit));
    setUndecrypted(isUndecryptedEvent(event));
    setEventType(event.getType());
  }, [event, latestEdit]);

  useEffect(() => {
    const originalHandler = () => {
      if (!event.isDecryptionFailure()) {
        setContent(getVisibleContent(event, latestEdit));
        setUndecrypted(false);
        setEventType(event.getType());
      }
    };
    const editHandler = () => {
      if (!latestEdit || latestEdit.isDecryptionFailure()) return;
      setContent(getVisibleContent(event, latestEdit));
    };

    event.on(MatrixEventEvent.Decrypted, originalHandler);
    latestEdit?.on(MatrixEventEvent.Decrypted, editHandler);
    return () => {
      event.removeListener(MatrixEventEvent.Decrypted, originalHandler);
      latestEdit?.removeListener(MatrixEventEvent.Decrypted, editHandler);
    };
  }, [event, latestEdit]);

  if (eventType !== "m.room.message" && !undecrypted) return null;
  if (eventType === "m.room.message" && !undecrypted && (!content || !content.msgtype))
    return null;

  const isMe = event.getSender() === client?.getUserId();
  const sender = shortName(event.getSender(), client);
  const time = formatTime(event.getDate());
  const hasBlockCode =
    content.msgtype !== "m.image" &&
    content.msgtype !== "m.video" &&
    typeof content.body === "string" &&
    content.format === "org.matrix.custom.html" &&
    content.body.includes("```");

  const bubble = (
    <div
      data-event-id={event.getId()}
      className={`relative rounded-[14px] px-3 py-2 text-[0.88rem] leading-[1.45] break-words ${
        hasBlockCode ? "w-full max-w-full" : "max-w-[75%] max-sm:max-w-[88%]"
      } ${
        isMe
          ? "self-end rounded-br-[4px] bg-msg-out"
          : "self-start rounded-bl-[4px] bg-msg-in"
      } ${
        selectMode
          ? "cursor-pointer transition-[box-shadow,filter] duration-150"
          : ""
      } ${
        selectMode && isSelected
          ? "ring-2 ring-accent/50 shadow-[0_0_0_1px_rgba(0,0,0,0.04)]"
          : ""
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

      <div className="mt-0.5 flex items-center justify-end gap-1 text-[0.65rem] text-muted">
        {isEdited && (
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="cursor-pointer rounded px-0.5 transition-colors hover:text-foreground hover:underline"
          >
            (edited)
          </button>
        )}
        <span>{time}</span>
      </div>

      {isEdited && showHistory && (
        <MessageEditHistoryModal
          onClose={() => setShowHistory(false)}
          sender={sender}
          versions={getHistoryEntries(event, editHistory)}
        />
      )}
    </div>
  );

  return bubble;
}

function MessageEditHistoryModal({
  onClose,
  sender,
  versions,
}: {
  onClose: () => void;
  sender: string;
  versions: { id: string; event: MatrixEvent; edited: boolean }[];
}) {
  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/75 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[80vh] w-[560px] max-w-full flex-col overflow-hidden rounded-[14px] border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-[1rem] font-semibold">Message history</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-muted transition-colors hover:text-foreground"
            title="Close history"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-3">
          {versions.map((version, index) => {
            const body = version.edited
              ? (getReplacementContent(version.event)?.body as string | undefined) ||
                ((version.event.getContent() as MessageContent).body as string | undefined)
              : ((version.event.getContent() as MessageContent).body as string | undefined);
            return (
              <div
                key={version.id}
                className="mb-2 rounded-[10px] border border-border bg-surface2 p-3 last:mb-0"
              >
                <div className="mb-1 flex items-center justify-between text-[0.72rem] text-muted">
                  <span>{index === 0 ? "Current" : `Version ${versions.length - index}`}</span>
                  <span>{`${sender} · ${new Date(version.event.getTs()).toLocaleString()}`}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-[0.88rem] leading-[1.4]">
                  {body || "[No body]"}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}

interface MessageBodyProps {
  content: MessageContent;
  openLightbox: (
    type: "image" | "video",
    content: Record<string, unknown>
  ) => void;
}

interface MediaContentProps {
  content: MessageContent;
  openLightbox: (
    type: "image" | "video",
    content: Record<string, unknown>
  ) => void;
}

const KNOWN_CODE_LANGS = new Set([
  "c",
  "cpp",
  "csharp",
  "css",
  "go",
  "html",
  "java",
  "javascript",
  "js",
  "json",
  "kotlin",
  "php",
  "python",
  "py",
  "ruby",
  "rust",
  "shell",
  "sh",
  "sql",
  "swift",
  "ts",
  "tsx",
  "typescript",
  "xml",
  "yaml",
  "yml",
]);

function asPlainText(value: ReactNode): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map((v) => asPlainText(v)).join("");
  if (isValidElement<{ children?: ReactNode }>(value)) {
    return asPlainText(value.props.children);
  }
  return "";
}

const URL_RE = /https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)\]}/]/g;

function Linkify({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_RE)) {
    const i = match.index!;
    if (i > lastIndex) parts.push(text.slice(lastIndex, i));

    const url = match[0];
    const matrixLink = parseMatrixToUrl(url);

    if (matrixLink) {
      parts.push(<MatrixToPill key={i} link={matrixLink} href={url} />);
    } else {
      parts.push(
        <a
          key={i}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline break-all hover:opacity-80"
        >
          {url}
        </a>
      );
    }

    lastIndex = i + match[0].length;
  }

  if (lastIndex === 0) return <>{text}</>;
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts}</>;
}

function linkifyChildren(children: ReactNode): ReactNode {
  return Children.map(children, (child) =>
    typeof child === "string" ? <Linkify text={child} /> : child
  );
}

function MatrixToPill({ link, href }: { link: MatrixToLink; href: string }) {
  const { client, navigateToEvent, setCurrentRoomId } = useMatrix();
  const room = client?.getRoom(link.roomId);
  const roomName = room?.name || link.roomId;
  const isJoined = !!room;

  const handleClick = () => {
    if (!isJoined) {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }
    if (link.eventId) {
      navigateToEvent(link.roomId, link.eventId);
    } else {
      setCurrentRoomId(link.roomId);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.85em] font-medium cursor-pointer border-none bg-accent/20 text-accent hover:bg-accent/35 align-baseline leading-[1.5] transition-colors"
      title={link.eventId ? `Message in ${roomName}` : roomName}
    >
      <MessageSquare size={13} className="shrink-0" />
      <span className="truncate max-w-[200px]">
        {link.eventId ? `Message in ${roomName}` : roomName}
      </span>
    </button>
  );
}

function MessageBody({ content, openLightbox }: MessageBodyProps) {
  switch (content.msgtype) {
    case "m.image":
      return <ImageContent content={content} openLightbox={openLightbox} />;
    case "m.video":
      return <VideoContent content={content} openLightbox={openLightbox} />;
    default: {
      const rawBody = (content.body as string) || "";
      if (content.format !== "org.matrix.custom.html") {
        return <p className="whitespace-pre-wrap break-words"><Linkify text={rawBody} /></p>;
      }

      // Ensure fenced code blocks have a newline after the opening fence so
      // they aren't misparsed (e.g. as lists) or produce empty blocks.
      const body = rawBody.replace(/```(\w*)([^\n\r])/g, "```$1\n$2");
      return (
        <div className="msg-markdown text-foreground text-[0.88rem] leading-[1.45] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            components={{
              a: ({ href, children }) => {
                if (href) {
                  const matrixLink = parseMatrixToUrl(href);
                  if (matrixLink) {
                    return <MatrixToPill link={matrixLink} href={href} />;
                  }
                }
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline break-all hover:opacity-80"
                  >
                    {children}
                  </a>
                );
              },
              code: ({
                node,
                className,
                children,
              }: {
                node?: Element;
                className?: string;
                children?: ReactNode;
              }) => {
                const isBlock = className?.startsWith("language-");
                if (isBlock) return <code className={className}>{children}</code>;
                const text = asPlainText(children);
                return (
                  <code className="rounded bg-muted/60 px-1 py-0.5 text-[0.9em] font-normal">
                    {text}
                  </code>
                );
              },
              pre: ({ children }) => {
                const first = Children.toArray(children)[0];
                if (!isValidElement<{ className?: string; children?: ReactNode }>(first))
                  return (
                    <pre className="my-1 w-full min-w-0 overflow-x-auto rounded-md border border-[var(--color-border)] px-3 py-2 text-[0.85em] font-mono">
                      {children}
                    </pre>
                  );

                const langClass = first.props.className || "";
                const langMatch = /language-([\w+-]+)/.exec(langClass);
                const lang = langMatch?.[1]?.toLowerCase() || "";
                let code = asPlainText(first.props.children).replace(/\n$/, "");
                const lines = code.split(/\r?\n/);

                if (lang && lines[0]?.trim().toLowerCase() === lang) {
                  lines.shift();
                } else if (!lang && lines.length > 1) {
                  const possibleLabel = lines[0]?.trim().toLowerCase();
                  if (possibleLabel && KNOWN_CODE_LANGS.has(possibleLabel)) {
                    lines.shift();
                  }
                }

                code = lines.join("\n");
                const numbered = (code || "").split(/\r?\n/);

                return (
                  <div
                    className="my-1 w-full min-w-0 overflow-hidden rounded-md border border-[var(--color-border)]"
                    style={{
                      backgroundColor: "var(--color-code-block-bg)",
                      color: "var(--color-code-block)",
                    }}
                  >
                    <div className="flex w-full">
                      <div
                        className="select-none shrink-0 border-r border-[var(--color-border)] px-2 py-2 text-right tabular-nums"
                        style={{ color: "var(--color-code-block-ln)" }}
                        aria-hidden
                      >
                        {numbered.map((_, i) => (
                          <div key={i} className="h-[1.45em] leading-[1.45em]">
                            {i + 1}
                          </div>
                        ))}
                      </div>
                      <div className="min-w-0 flex-1 overflow-x-auto py-2 pr-3">
                        {numbered.map((line, i) => (
                          <div
                            key={i}
                            className="pl-3 font-mono text-[0.85em] leading-[1.45em] whitespace-pre"
                          >
                            {line || " "}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              },
              ul: ({ children }) => (
                <ul className="my-0.5 list-disc pl-5 [list-style-type:disc]">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="my-0.5 list-decimal pl-5 [list-style-type:decimal]">
                  {children}
                </ol>
              ),
              li: ({ children }) => (
                <li className="my-0.25 pl-0.5 [display:list-item]">
                  {linkifyChildren(children)}
                </li>
              ),
              p: ({ children }) => (
                <p className="block my-0.5 min-h-[1em] [&:first-child]:mt-0 [&:last-child]:mb-0">
                  {linkifyChildren(children)}
                </p>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-inherit">{linkifyChildren(children)}</strong>
              ),
              em: ({ children }) => (
                <em className="italic text-inherit">{linkifyChildren(children)}</em>
              ),
              del: ({ children }) => (
                <del className="line-through text-inherit">{linkifyChildren(children)}</del>
              ),
              h1: ({ children }) => (
                <h1 className="text-[1.1em] font-bold my-0.5 text-inherit">
                  {linkifyChildren(children)}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-[1.05em] font-bold my-0.5 text-inherit">
                  {linkifyChildren(children)}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-[1em] font-bold my-0.5 text-inherit">
                  {linkifyChildren(children)}
                </h3>
              ),
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-muted pl-3 my-0.5 text-muted italic">
                  {children}
                </blockquote>
              ),
              hr: () => <hr className="border-border my-1 border-t" />,
              table: ({ children }) => (
                <div className="my-1 overflow-x-auto">
                  <table className="w-full border-collapse text-[0.9em]">
                    {children}
                  </table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="border-b border-border">{children}</thead>
              ),
              tbody: ({ children }) => <tbody>{children}</tbody>,
              tr: ({ children }) => (
                <tr className="border-b border-border/60">{children}</tr>
              ),
              th: ({ children }) => (
                <th className="text-left font-semibold py-0.5 pr-2 text-inherit">
                  {linkifyChildren(children)}
                </th>
              ),
              td: ({ children }) => (
                <td className="py-0.5 pr-2 text-inherit">{linkifyChildren(children)}</td>
              ),
            }}
          >
            {body}
          </ReactMarkdown>
        </div>
      );
    }
  }
}

function MediaLoadingPlaceholder({
  filename,
  icon,
}: {
  filename: string;
  icon: React.ReactNode;
}) {
  const [showFilename, setShowFilename] = useState(false);
  return (
    <div className="relative mt-1 flex min-h-[120px] min-w-[140px] items-center justify-center gap-2 rounded-sm border border-border bg-muted/30">
      <div className="flex flex-col items-center gap-2">
        {icon}
        <Loader2 size={20} className="animate-spin text-muted" />
      </div>
      {/* Tooltip on click for touch: tap to toggle filename */}
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={() => setShowFilename((v) => !v)}
        title={filename}
        aria-label={filename}
      />
      {showFilename && (
        <div className="absolute bottom-2 left-2 right-2 truncate rounded bg-black/70 px-2 py-1 text-center text-[0.7rem] text-neutral-200">
          {filename}
        </div>
      )}
    </div>
  );
}

function ImageContent({
  content,
  openLightbox,
}: MediaContentProps) {
  const { client, allSwarmClients } = useMatrix();
  const { hideMedia } = useSettings();
  const [src, setSrc] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(!hideMedia);

  useEffect(() => {
    setRevealed(!hideMedia);
  }, [hideMedia]);

  useEffect(() => {
    if (!client) return;
    const mediaUrl = content.url || (content.file as Record<string, unknown>)?.url;
    if (!mediaUrl) return;
    const info = content.info as Record<string, unknown> | undefined;
    const hasThumbnail = !!(info?.thumbnail_url || info?.thumbnail_file);
    fetchMedia(content as never, client, {
      thumbnail: hasThumbnail,
      fallbackClients: allSwarmClients,
    }).then((url) => {
      if (url) setSrc(url);
    });
  }, [client, content, allSwarmClients]);

  if (!src)
    return (
      <MediaLoadingPlaceholder
        filename={(content.body as string) || "[image]"}
        icon={<FileImage size={32} className="text-muted" />}
      />
    );

  return (
    <div className="relative mt-1 inline-block max-w-full">
      <img
        src={src}
        alt={(content.body as string) || "image"}
        loading="lazy"
        onClick={() => revealed && openLightbox("image", content)}
        className={`block max-h-[300px] max-w-full rounded-sm ${revealed ? "cursor-pointer" : ""}`}
      />
      {!revealed && (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-sm bg-black text-[0.8rem] text-neutral-400 transition-opacity hover:text-neutral-200"
        >
          Click to reveal
        </button>
      )}
      {revealed && hideMedia && (
        <button
          type="button"
          onClick={() => setRevealed(false)}
          title="Hide media"
          className="absolute top-1 left-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-black/60 text-neutral-300 transition-colors hover:bg-black/80 hover:text-white"
        >
          <EyeOff size={13} />
        </button>
      )}
    </div>
  );
}

function VideoContent({
  content,
  openLightbox,
}: MediaContentProps) {
  const { client, allSwarmClients } = useMatrix();
  const { hideMedia } = useSettings();
  const [src, setSrc] = useState<string | null>(null);
  const [poster, setPoster] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(!hideMedia);

  useEffect(() => {
    setRevealed(!hideMedia);
  }, [hideMedia]);

  useEffect(() => {
    if (!client) return;
    const mediaUrl = content.url || (content.file as Record<string, unknown>)?.url;
    if (!mediaUrl) return;
    fetchMedia(content as never, client, { fallbackClients: allSwarmClients }).then((url) => {
      if (url) setSrc(url);
    });
    const info = content.info as Record<string, unknown> | undefined;
    const hasThumbnail = !!(info?.thumbnail_url || info?.thumbnail_file);
    if (hasThumbnail) {
      fetchMedia(content as never, client, { thumbnail: true, fallbackClients: allSwarmClients }).then((url) => {
        if (url) setPoster(url);
      });
    }
  }, [client, content, allSwarmClients]);

  if (!src)
    return (
      <MediaLoadingPlaceholder
        filename={(content.body as string) || "[video]"}
        icon={<Film size={32} className="text-muted" />}
      />
    );

  return (
    <div className="relative mt-1 inline-block max-w-full">
      <video
        src={revealed ? src : undefined}
        poster={poster || undefined}
        controls={revealed}
        preload="metadata"
        playsInline
        onDoubleClick={(e) => {
          if (!revealed) return;
          e.preventDefault();
          openLightbox("video", content);
        }}
        className="block max-h-[300px] max-w-full rounded-sm bg-black"
      />
      {!revealed && (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-sm bg-black text-[0.8rem] text-neutral-400 transition-opacity hover:text-neutral-200"
        >
          Click to reveal
        </button>
      )}
      {revealed && hideMedia && (
        <button
          type="button"
          onClick={() => setRevealed(false)}
          title="Hide media"
          className="absolute top-1 left-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-black/60 text-neutral-300 transition-colors hover:bg-black/80 hover:text-white"
        >
          <EyeOff size={13} />
        </button>
      )}
    </div>
  );
}
