import { useState, useEffect, useRef } from "react";
import { useMatrix } from "../contexts/MatrixContext";

export default function RecoveryModal() {
  const {
    showRecoveryModal,
    submitRecoveryKey,
    cancelRecovery,
    recoveryError,
    recoveryLoading,
  } = useMatrix();
  const [keyValue, setKeyValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (showRecoveryModal) {
      setKeyValue("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [showRecoveryModal]);

  if (!showRecoveryModal) return null;

  const handleSubmit = () => {
    const trimmed = keyValue.trim();
    if (trimmed) submitRecoveryKey(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) cancelRecovery();
      }}
    >
      <div className="w-[420px] max-w-full rounded-[14px] border border-border bg-surface p-6">
        <h2 className="mb-2 text-[1.1rem] font-semibold">Recovery Key</h2>
        <p className="mb-3 text-[0.84rem] leading-relaxed text-muted">
          Enter your recovery key (also called security key) to decrypt messages
          from encrypted rooms.
        </p>
        <textarea
          ref={inputRef}
          value={keyValue}
          onChange={(e) => setKeyValue(e.target.value)}
          placeholder="Enter your recovery key…"
          rows={3}
          spellCheck={false}
          className="w-full resize-y rounded-sm border border-border bg-background px-3.5 py-2.5 font-mono text-[0.85rem] text-foreground outline-none transition-colors focus:border-accent"
        />
        {recoveryError && (
          <p className="mt-1 text-[0.82rem] text-danger">{recoveryError}</p>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={cancelRecovery}
            className="rounded-sm bg-surface2 px-4 py-2 font-medium text-muted transition-colors hover:bg-border"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={recoveryLoading}
            className="rounded-sm bg-accent px-4 py-2 font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {recoveryLoading ? "Restoring…" : "Restore Keys"}
          </button>
        </div>
      </div>
    </div>
  );
}
