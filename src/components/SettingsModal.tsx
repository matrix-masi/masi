import { X } from "lucide-react";
import { createPortal } from "react-dom";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
}

export default function SettingsModal({
  open,
  onClose,
  onLogout,
}: SettingsModalProps) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-100 bg-surface">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-[1.1rem] font-semibold">Settings</h2>
          <button
            onClick={onClose}
            title="Close settings"
            className="rounded-sm p-1.5 text-muted transition-colors hover:text-foreground"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-[0.9rem] text-muted">
            Manage your account and client options.
          </p>
        </div>

        <div className="flex justify-end border-t border-border px-5 py-4">
          <button
            onClick={onLogout}
            className="rounded-sm bg-danger px-4 py-2 font-semibold text-white transition-colors hover:bg-danger-hover"
          >
            Logout
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
