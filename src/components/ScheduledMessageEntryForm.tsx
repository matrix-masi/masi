import { useMemo, useState, type FormEvent } from "react";
import type { Room } from "matrix-js-sdk";
import ScheduledTargetSelector from "./ScheduledTargetSelector";

export interface ScheduledMessageFormValues {
  to: string;
  targetRoomId?: string;
  scheduledAt: number;
  message: string;
  files: File[];
}

interface ScheduledMessageEntryFormProps {
  rooms: Room[];
  initialDate: Date;
  initialTo?: string;
  initialTargetRoomId?: string;
  initialMessage?: string;
  initialScheduledAt?: number;
  submitLabel?: string;
  loading?: boolean;
  onSubmit: (values: ScheduledMessageFormValues) => Promise<void> | void;
  onCancel?: () => void;
}

function toDateTimeLocal(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultScheduledAt(initialDate: Date): number {
  const date = new Date(initialDate);
  const now = new Date();
  date.setHours(now.getHours() + 1, 0, 0, 0);
  return date.getTime();
}

function minDateTimeLocal(): string {
  return toDateTimeLocal(Date.now());
}

export default function ScheduledMessageEntryForm({
  rooms,
  initialDate,
  initialTo = "",
  initialTargetRoomId,
  initialMessage = "",
  initialScheduledAt,
  submitLabel = "Schedule",
  loading = false,
  onSubmit,
  onCancel,
}: ScheduledMessageEntryFormProps) {
  const [to, setTo] = useState(initialTo);
  const [targetRoomId, setTargetRoomId] = useState<string | undefined>(
    initialTargetRoomId,
  );
  const [scheduledAt, setScheduledAt] = useState(
    toDateTimeLocal(initialScheduledAt ?? defaultScheduledAt(initialDate)),
  );
  const [message, setMessage] = useState(initialMessage);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fileSummary = useMemo(
    () => files.map((file) => file.name).join(", "),
    [files],
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedTo = to.trim();
    const trimmedMessage = message.trim();
    if (!trimmedTo) {
      setError("Choose a destination room.");
      return;
    }
    if (!trimmedMessage && files.length === 0) {
      setError("Enter a message or attach media.");
      return;
    }
    const ts = new Date(scheduledAt).getTime();
    if (!Number.isFinite(ts)) {
      setError("Choose a valid send time.");
      return;
    }
    if (ts < Date.now()) {
      setError("Choose a send time in the future.");
      return;
    }

    setError(null);
    await onSubmit({
      to: trimmedTo,
      targetRoomId,
      scheduledAt: ts,
      message: trimmedMessage,
      files,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <ScheduledTargetSelector
        rooms={rooms}
        value={to}
        onChange={(value, roomId) => {
          setTo(value);
          setTargetRoomId(roomId);
        }}
      />

      <div>
        <label className="mb-1 block text-[0.8rem] font-medium text-muted">
          Send at
        </label>
        <input
          type="datetime-local"
          min={minDateTimeLocal()}
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="w-full rounded-sm border border-border bg-background px-3 py-2 text-[0.85rem] text-foreground outline-none transition-colors focus:border-accent"
        />
      </div>

      <div>
        <label className="mb-1 block text-[0.8rem] font-medium text-muted">
          Message
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="Message…"
          className="w-full resize-none rounded-sm border border-border bg-background px-3 py-2 text-[0.9rem] text-foreground outline-none transition-colors focus:border-accent"
        />
      </div>

      <div>
        <label className="mb-1 block text-[0.8rem] font-medium text-muted">
          Attachments
        </label>
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="block w-full text-[0.82rem] text-muted file:mr-3 file:rounded-sm file:border-0 file:bg-surface2 file:px-3 file:py-1.5 file:text-foreground"
        />
        {fileSummary && (
          <p className="mt-1 text-[0.76rem] text-muted">{fileSummary}</p>
        )}
      </div>

      {error && <p className="text-[0.8rem] text-danger">{error}</p>}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-sm px-3 py-1.5 text-[0.85rem] text-muted transition-colors hover:text-foreground"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          className="rounded-sm bg-accent px-4 py-1.5 text-[0.85rem] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? "Scheduling…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
