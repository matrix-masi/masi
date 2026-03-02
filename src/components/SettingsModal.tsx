import { X, Sun, Moon } from "lucide-react";
import { createPortal } from "react-dom";
import { useTheme } from "../contexts/ThemeContext";

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
  const { theme, toggleTheme } = useTheme();

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
          <p className="text-[0.9rem] text-muted mb-6">
            Manage your account and client options.
          </p>

          <div className="space-y-4">
            <h3 className="text-[0.85rem] font-semibold uppercase tracking-wide text-muted">
              Appearance
            </h3>
            <div className="flex items-center justify-between rounded-lg bg-surface2 px-4 py-3">
              <div className="flex items-center gap-3">
                {theme === "dark" ? (
                  <Moon size={18} className="text-muted" />
                ) : (
                  <Sun size={18} className="text-muted" />
                )}
                <span className="text-[0.9rem]">Theme</span>
              </div>
              <button
                onClick={toggleTheme}
                className="relative h-7 w-[52px] rounded-full bg-border transition-colors"
                title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white transition-transform ${
                    theme === "light" ? "translate-x-[24px]" : ""
                  }`}
                >
                  {theme === "dark" ? (
                    <Moon size={12} />
                  ) : (
                    <Sun size={12} />
                  )}
                </span>
              </button>
            </div>
          </div>
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
