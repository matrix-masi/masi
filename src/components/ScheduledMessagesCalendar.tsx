import { useRef, useMemo, useState, type WheelEvent } from "react";
import { ChevronLeft, ChevronRight, Copy, RotateCcw, Trash2 } from "lucide-react";
import type { Room } from "matrix-js-sdk";
import { useMatrix } from "../contexts/MatrixContext";
import { useSettings } from "../contexts/SettingsContext";
import { useSwarm } from "../contexts/SwarmContext";
import { useScheduledMessages } from "../hooks/useScheduledMessages";
import type { ScheduledMessageRecord } from "../lib/scheduledMessages";
import ScheduledMessageEntryForm, {
  type ScheduledMessageFormValues,
} from "./ScheduledMessageEntryForm";

function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function sameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isPastDay(date: Date): boolean {
  return startOfDay(date).getTime() < startOfDay(new Date()).getTime();
}

function monthGrid(month: Date): Date[] {
  const first = startOfMonth(month);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    days.push(day);
  }
  return days;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function recordSummary(record: ScheduledMessageRecord): string {
  const text = record.payload.message.trim();
  if (text) return text;
  return `${record.payload.attachments.length} attachment${record.payload.attachments.length === 1 ? "" : "s"}`;
}

export default function ScheduledMessagesCalendar() {
  const { client, activeSwarm, allSwarmClients } = useMatrix();
  const { swarms, activeSwarmId, setActiveSwarm } = useSwarm();
  const { sendMarkdown } = useSettings();
  const scheduled = useScheduledMessages(client, activeSwarm);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ScheduledMessageRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const lastWheelMonthChangeRef = useRef(0);

  const rooms: Room[] = useMemo(() => {
    const seen = new Map<string, Room>();
    for (const c of allSwarmClients.length > 0 ? allSwarmClients : client ? [client] : []) {
      for (const room of c.getRooms()) {
        if (room.getMyMembership() !== "join") continue;
        seen.set(room.roomId, room);
      }
    }
    return Array.from(seen.values()).sort((a, b) =>
      (a.name || a.roomId).localeCompare(b.name || b.roomId),
    );
  }, [allSwarmClients, client]);

  const days = useMemo(() => monthGrid(visibleMonth), [visibleMonth]);
  const selectedKey = dayKey(selectedDay);
  const selectedRecords = scheduled.messagesByDay[selectedKey] ?? [];
  const selectedDayIsPast = isPastDay(selectedDay);
  const failedCount = scheduled.messages.filter(
    (record) => record.payload.lastError,
  ).length;

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3500);
  };

  const submitSchedule = async (values: ScheduledMessageFormValues) => {
    setSubmitting(true);
    try {
      if (editing) {
        const warnings = await scheduled.update(editing, {
          ...values,
          markdown: editing.payload.markdown,
        });
        if (warnings.length > 0) showToast(warnings.join(" "));
        else showToast("Scheduled message updated.");
      } else {
        const result = await scheduled.add({
          ...values,
          markdown: sendMarkdown,
        });
        if (result.warnings.length > 0) showToast(result.warnings.join(" "));
        else showToast("Message scheduled.");
      }
      setShowForm(false);
      setEditing(null);
    } finally {
      setSubmitting(false);
    }
  };

  const duplicateRecord = async (record: ScheduledMessageRecord) => {
    setSubmitting(true);
    try {
      await scheduled.add({
        to: record.payload.to,
        targetRoomId: record.payload.targetRoomId,
        scheduledAt: new Date(selectedDay).setHours(9, 0, 0, 0),
        message: record.payload.message,
        markdown: record.payload.markdown,
        files: [],
      });
      showToast("Duplicated message metadata. Reattach media if needed.");
    } finally {
      setSubmitting(false);
    }
  };

  const changeMonth = (delta: number) => {
    setVisibleMonth(
      (month) => new Date(month.getFullYear(), month.getMonth() + delta, 1),
    );
  };

  const handleCalendarWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaY) < 10) return;
    e.preventDefault();
    const now = Date.now();
    if (now - lastWheelMonthChangeRef.current < 350) return;
    lastWheelMonthChangeRef.current = now;
    changeMonth(e.deltaY > 0 ? 1 : -1);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h2 className="text-[1.05rem] font-semibold">Calendar</h2>
          <p className="text-[0.78rem] text-muted">
            Messages send while Masi is running. Failed sends retry hourly.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {swarms.length > 1 && (
            <select
              value={activeSwarmId ?? ""}
              onChange={(e) => setActiveSwarm(e.target.value)}
              className="rounded-sm border border-border bg-background px-2.5 py-1.5 text-[0.82rem] text-foreground outline-none focus:border-accent"
            >
              {swarms.map((swarm) => (
                <option key={swarm.id} value={swarm.id}>
                  {swarm.name}
                </option>
              ))}
            </select>
          )}
          {failedCount > 0 && (
            <span className="rounded-sm bg-danger/15 px-2.5 py-1.5 text-[0.78rem] text-danger">
              {failedCount} failed
            </span>
          )}
          <button
            type="button"
            onClick={() => scheduled.refresh({ create: true, backfill: true })}
            className="rounded-sm bg-surface2 px-3 py-1.5 text-[0.82rem] text-foreground transition-colors hover:bg-border"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 max-lg:flex-col">
        <section className="flex min-w-0 flex-1 flex-col p-4">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() =>
                changeMonth(-1)
              }
              className="rounded-sm p-2 text-muted transition-colors hover:bg-surface2 hover:text-foreground"
            >
              <ChevronLeft size={18} />
            </button>
            <h3 className="text-[1rem] font-semibold">
              {visibleMonth.toLocaleDateString([], {
                month: "long",
                year: "numeric",
              })}
            </h3>
            <button
              type="button"
              onClick={() =>
                changeMonth(1)
              }
              className="rounded-sm p-2 text-muted transition-colors hover:bg-surface2 hover:text-foreground"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[0.72rem] font-semibold uppercase tracking-wide text-muted">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
              <div key={label} className="py-1">
                {label}
              </div>
            ))}
          </div>
          <div
            onWheel={handleCalendarWheel}
            className="grid min-h-0 flex-1 grid-cols-7 gap-1"
          >
            {days.map((day) => {
              const key = dayKey(day);
              const records = scheduled.messagesByDay[key] ?? [];
              const inMonth = day.getMonth() === visibleMonth.getMonth();
              const isSelected = sameDay(day, selectedDay);
              const isToday = sameDay(day, new Date());
              const past = isPastDay(day);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setSelectedDay(day);
                    setShowForm(false);
                    setEditing(null);
                  }}
                  className={`min-h-[78px] rounded-md border p-2 text-left transition-colors ${
                    isSelected
                      ? "border-accent bg-accent/10"
                      : isToday
                        ? "border-amber-400 bg-yellow-500/10 hover:bg-yellow-500/15"
                        : past
                          ? "border-border bg-surface/50 opacity-45 hover:bg-surface/60"
                      : "border-border bg-surface hover:bg-surface2"
                  } ${inMonth ? "text-foreground" : "text-muted/60"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[0.8rem] font-semibold">{day.getDate()}</span>
                    {records.length > 0 && (
                      <span className="rounded-full bg-accent px-2 py-0.5 text-[0.68rem] text-white">
                        {records.length}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 space-y-1">
                    {records.slice(0, 2).map((record) => (
                      <div
                        key={record.eventId}
                        className="truncate text-[0.68rem] text-muted"
                      >
                        {formatTime(record.payload.scheduledAt)} {recordSummary(record)}
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="w-[380px] max-w-full border-l border-border bg-surface p-4 max-lg:w-full max-lg:border-l-0 max-lg:border-t">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-[0.95rem] font-semibold">
                {selectedDay.toLocaleDateString([], {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
              </h3>
              <p className="text-[0.75rem] text-muted">
                {selectedRecords.length} scheduled
              </p>
            </div>
            <button
              type="button"
              disabled={selectedDayIsPast}
              onClick={() => {
                setShowForm(true);
                setEditing(null);
              }}
              className="rounded-sm bg-accent px-3 py-1.5 text-[0.82rem] font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              title={selectedDayIsPast ? "Cannot schedule messages in the past" : "New scheduled message"}
            >
              New
            </button>
          </div>
          {selectedDayIsPast && (
            <p className="mb-3 rounded-sm border border-border bg-background px-3 py-2 text-[0.78rem] text-muted">
              Past days are read-only. Choose today or a future date to schedule a message.
            </p>
          )}

          {scheduled.loading && (
            <p className="mb-3 text-[0.82rem] text-muted">Loading calendar…</p>
          )}
          {scheduled.error && (
            <p className="mb-3 text-[0.82rem] text-danger">{scheduled.error}</p>
          )}

          {(showForm || editing) && (
            <div className="mb-4 rounded-lg border border-border bg-background p-3">
              <ScheduledMessageEntryForm
                rooms={rooms}
                initialDate={selectedDay}
                initialTo={editing?.payload.to}
                initialTargetRoomId={editing?.payload.targetRoomId}
                initialMessage={editing?.payload.message}
                initialScheduledAt={editing?.payload.scheduledAt}
                submitLabel={editing ? "Update" : "Schedule"}
                loading={submitting}
                onSubmit={submitSchedule}
                onCancel={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
              />
              {editing && editing.payload.attachments.length > 0 && (
                <p className="mt-2 text-[0.75rem] text-muted">
                  Existing attachments are kept unless you choose new files.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            {selectedRecords.map((record) => (
              <div
                key={record.eventId}
                className="rounded-lg border border-border bg-background p-3"
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(record);
                      setShowForm(false);
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="text-[0.85rem] font-semibold">
                      {formatTime(record.payload.scheduledAt)}
                    </div>
                    <div className="truncate text-[0.82rem] text-foreground">
                      {recordSummary(record)}
                    </div>
                    <div className="truncate text-[0.72rem] text-muted">
                      To: {record.payload.to}
                    </div>
                  </button>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      title="Duplicate"
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateRecord(record);
                      }}
                      className="rounded-sm p-1.5 text-muted transition-colors hover:bg-surface2 hover:text-foreground"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      type="button"
                      title="Reset retries"
                      onClick={(e) => {
                        e.stopPropagation();
                        scheduled.resetRetries(record);
                      }}
                      className="rounded-sm p-1.5 text-muted transition-colors hover:bg-surface2 hover:text-foreground"
                    >
                      <RotateCcw size={14} />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        scheduled.remove(record);
                      }}
                      className="rounded-sm p-1.5 text-muted transition-colors hover:bg-danger/15 hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {record.payload.attachments.length > 0 && (
                  <div className="text-[0.72rem] text-muted">
                    {record.payload.attachments.length} attachment
                    {record.payload.attachments.length === 1 ? "" : "s"}
                  </div>
                )}
                {record.payload.lastError && (
                  <div className="mt-2 rounded-sm bg-danger/10 px-2 py-1 text-[0.72rem] text-danger">
                    {record.payload.lastError}
                  </div>
                )}
              </div>
            ))}
            {selectedRecords.length === 0 && !showForm && (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-[0.82rem] text-muted">
                No messages scheduled for this day.
              </p>
            )}
          </div>
        </aside>
      </div>

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-border bg-surface2 px-4 py-2 text-[0.82rem] shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
