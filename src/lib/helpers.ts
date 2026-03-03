import type { MatrixClient, MatrixEvent } from "matrix-js-sdk";

export function formatTime(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(date: Date | null | undefined): string {
  if (!date) return "";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function shortName(
  userId: string | undefined,
  client: MatrixClient | null
): string {
  if (!userId) return "";
  if (!client) return userId;
  const member = client.getUser(userId);
  const name = member?.displayName || userId;
  return name.split(":")[0].replace("@", "");
}

export function isUndecryptedEvent(event: MatrixEvent): boolean {
  return event.getType() === "m.room.encrypted" || event.isDecryptionFailure();
}

export function getEventPreview(
  event: MatrixEvent,
  client: MatrixClient | null
): string {
  if (isUndecryptedEvent(event)) {
    const sender = shortName(event.getSender(), client);
    return `${sender}: 🔒 Encrypted`;
  }
  const content = event.getContent();
  if (event.getType() !== "m.room.message") return "";
  const sender = shortName(event.getSender(), client);
  switch (content.msgtype) {
    case "m.image":
      return `${sender}: 📷 Image`;
    case "m.video":
      return `${sender}: 🎬 Video`;
    case "m.file":
      return `${sender}: 📎 File`;
    default:
      return `${sender}: ${content.body || ""}`;
  }
}

export function getImageDimensions(
  file: File
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });
}

export interface MatrixToLink {
  roomId: string;
  eventId?: string;
}

export function parseMatrixToUrl(href: string): MatrixToLink | null {
  try {
    if (!href.includes("matrix.to/#/")) return null;
    const idx = href.indexOf("#/");
    const fragment = href.slice(idx + 2);
    const [path] = fragment.split("?");
    const parts = path.split("/");
    const roomId = decodeURIComponent(parts[0]);
    if (!roomId.startsWith("!")) return null;
    let eventId: string | undefined;
    if (parts.length > 1 && parts[1]) {
      eventId = decodeURIComponent(parts[1]);
      if (!eventId.startsWith("$")) eventId = undefined;
    }
    return { roomId, eventId };
  } catch {
    return null;
  }
}

export function getVideoDimensions(
  file: File
): Promise<{ width: number; height: number; duration: number } | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: Math.round(video.duration * 1000),
      });
      URL.revokeObjectURL(video.src);
    };
    video.onerror = () => resolve(null);
    video.src = URL.createObjectURL(file);
  });
}
