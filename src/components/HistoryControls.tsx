import { useState } from "react";

interface HistoryControlsProps {
  canPaginate: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  onLoadToDate: (date: Date) => void;
}

export default function HistoryControls({
  canPaginate,
  isLoading,
  onLoadMore,
  onLoadToDate,
}: HistoryControlsProps) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateValue, setDateValue] = useState("");

  const handleGo = () => {
    if (dateValue) {
      onLoadToDate(new Date(dateValue + "T00:00:00"));
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 px-4 pb-2 pt-3">
      {isLoading ? (
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent" />
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
          </div>
          {showDatePicker && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
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
        </>
      ) : (
        <div className="text-[0.76rem] italic text-muted">
          Beginning of conversation
        </div>
      )}
    </div>
  );
}
