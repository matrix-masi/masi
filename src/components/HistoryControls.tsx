import { useState } from "react";
import type { DateRange } from "../hooks/useTimeline";

interface HistoryControlsProps {
  canPaginate: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  onLoadToDate: (date: Date) => void;
  onLoadBetweenDates?: (from: Date, to: Date) => void;
  dateRange?: DateRange | null;
  onClearDateRange?: () => void;
}

export default function HistoryControls({
  canPaginate,
  isLoading,
  onLoadMore,
  onLoadToDate,
  onLoadBetweenDates,
  dateRange,
  onClearDateRange,
}: HistoryControlsProps) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateValue, setDateValue] = useState("");
  const [showBetweenPicker, setShowBetweenPicker] = useState(false);
  const [fromValue, setFromValue] = useState("");
  const [toValue, setToValue] = useState("");

  const handleGo = () => {
    if (dateValue) {
      onLoadToDate(new Date(dateValue + "T00:00:00"));
    }
  };

  const handleBetweenGo = () => {
    if (fromValue && toValue && onLoadBetweenDates) {
      const from = new Date(fromValue + "T00:00:00");
      const to = new Date(toValue + "T23:59:59.999");
      if (from.getTime() <= to.getTime()) {
        onLoadBetweenDates(from, to);
        setShowBetweenPicker(false);
      }
    }
  };

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="flex flex-col items-center gap-2 px-4 pb-2 pt-3">
      {isLoading ? (
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent" />
      ) : dateRange && onClearDateRange ? (
        <button
          onClick={onClearDateRange}
          className="rounded-sm bg-surface2 px-3 py-1.5 text-[0.78rem] font-medium text-muted transition-colors hover:bg-border hover:text-foreground"
        >
          Show full timeline
        </button>
      ) : canPaginate ? (
        <>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={onLoadMore}
              className="rounded-sm bg-surface2 px-3 py-1.5 text-[0.78rem] font-medium text-muted transition-colors hover:bg-border hover:text-foreground"
            >
              Load previous messages
            </button>
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="rounded-sm bg-surface2 px-3 py-1.5 text-[0.78rem] font-medium text-muted transition-colors hover:bg-border hover:text-foreground"
            >
              Load to date…
            </button>
            {onLoadBetweenDates && (
              <button
                onClick={() => setShowBetweenPicker(!showBetweenPicker)}
                className="rounded-sm bg-surface2 px-3 py-1.5 text-[0.78rem] font-medium text-muted transition-colors hover:bg-border hover:text-foreground"
              >
                Load between dates…
              </button>
            )}
          </div>
          {showDatePicker && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
                max={today}
                autoFocus
                className="rounded-sm border border-border bg-background px-2.5 py-1.5 text-[0.8rem] text-foreground outline-none transition-colors [color-scheme:dark] focus:border-accent"
              />
              <button
                onClick={handleGo}
                className="rounded-sm bg-accent px-3 py-1.5 text-[0.78rem] font-medium text-white transition-colors hover:bg-accent-hover"
              >
                Go
              </button>
            </div>
          )}
          {showBetweenPicker && onLoadBetweenDates && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <input
                type="date"
                value={fromValue}
                onChange={(e) => setFromValue(e.target.value)}
                max={toValue || today}
                placeholder="From"
                className="rounded-sm border border-border bg-background px-2.5 py-1.5 text-[0.8rem] text-foreground outline-none transition-colors [color-scheme:dark] focus:border-accent"
              />
              <span className="text-[0.78rem] text-muted">to</span>
              <input
                type="date"
                value={toValue}
                onChange={(e) => setToValue(e.target.value)}
                min={fromValue}
                max={today}
                placeholder="To"
                className="rounded-sm border border-border bg-background px-2.5 py-1.5 text-[0.8rem] text-foreground outline-none transition-colors [color-scheme:dark] focus:border-accent"
              />
              <button
                onClick={handleBetweenGo}
                disabled={!fromValue || !toValue || fromValue > toValue}
                className="rounded-sm bg-accent px-3 py-1.5 text-[0.78rem] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                Go
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-[0.76rem] italic text-muted">
          Beginning of conversation
        </div>
      )}
    </div>
  );
}
