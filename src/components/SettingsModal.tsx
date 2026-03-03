import { X, Sun, Moon, EyeOff, Bold, Image, MessageSquare, Clock, CheckCircle } from "lucide-react";
import { createPortal } from "react-dom";
import { useTheme } from "../contexts/ThemeContext";
import { useSettings } from "../contexts/SettingsContext";

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
  const {
    hideMedia,
    toggleHideMedia,
    sendMarkdown,
    toggleSendMarkdown,
    sendReadReceipts,
    toggleSendReadReceipts,
    playlistImageDuration,
    setPlaylistImageDuration,
    playlistShowMessages,
    togglePlaylistShowMessages,
    playlistMessageDuration,
    setPlaylistMessageDuration,
  } = useSettings();

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
                className={`relative h-7 w-[52px] rounded-full transition-colors ${theme === "light" ? "bg-accent" : "bg-border"}`}
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

          <div className="mt-6 space-y-4">
            <h3 className="text-[0.85rem] font-semibold uppercase tracking-wide text-muted">
              Messages
            </h3>
            <div className="flex items-center justify-between rounded-lg bg-surface2 px-4 py-3">
              <div className="flex items-center gap-3">
                <Bold size={18} className="text-muted" />
                <div>
                  <span className="text-[0.9rem]">Send markdown formatting</span>
                  <p className="text-[0.75rem] text-muted">
                    Sends rich text so other Matrix clients render formatting
                  </p>
                </div>
              </div>
              <button
                onClick={toggleSendMarkdown}
                className={`relative h-7 w-[52px] shrink-0 rounded-full transition-colors ${sendMarkdown ? "bg-accent" : "bg-border"}`}
                title={sendMarkdown ? "Send plain text messages" : "Send markdown formatting"}
              >
                <span
                  className={`absolute top-0.5 left-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white transition-transform ${
                    sendMarkdown ? "translate-x-[24px]" : ""
                  }`}
                >
                  <Bold size={12} />
                </span>
              </button>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-surface2 px-4 py-3">
              <div className="flex items-center gap-3">
                <EyeOff size={18} className="text-muted" />
                <div>
                  <span className="text-[0.9rem]">Hide media by default</span>
                  <p className="text-[0.75rem] text-muted">
                    Images and videos are hidden until you click to reveal them
                  </p>
                </div>
              </div>
              <button
                onClick={toggleHideMedia}
                className={`relative h-7 w-[52px] shrink-0 rounded-full transition-colors ${hideMedia ? "bg-accent" : "bg-border"}`}
                title={hideMedia ? "Show media by default" : "Hide media by default"}
              >
                <span
                  className={`absolute top-0.5 left-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white transition-transform ${
                    hideMedia ? "translate-x-[24px]" : ""
                  }`}
                >
                  <EyeOff size={12} />
                </span>
              </button>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-surface2 px-4 py-3">
              <div className="flex items-center gap-3">
                <CheckCircle size={18} className="text-muted" />
                <div>
                  <span className="text-[0.9rem]">Send read receipts?</span>
                  <p className="text-[0.75rem] text-muted">
                    Let others see when you've read messages. When on, receipts are sent when you open a chat and when you use Mark all as read.
                  </p>
                </div>
              </div>
              <button
                onClick={toggleSendReadReceipts}
                className={`relative h-7 w-[52px] shrink-0 rounded-full transition-colors ${sendReadReceipts ? "bg-accent" : "bg-border"}`}
                title={sendReadReceipts ? "Stop sending read receipts" : "Send read receipts"}
              >
                <span
                  className={`absolute top-0.5 left-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white transition-transform ${
                    sendReadReceipts ? "translate-x-[24px]" : ""
                  }`}
                >
                  <CheckCircle size={12} />
                </span>
              </button>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <h3 className="text-[0.85rem] font-semibold uppercase tracking-wide text-muted">
              Playlist
            </h3>
            <div className="flex items-center justify-between rounded-lg bg-surface2 px-4 py-3">
              <div className="flex items-center gap-3">
                <Image size={18} className="text-muted" />
                <div>
                  <span className="text-[0.9rem]">Image display duration</span>
                  <p className="text-[0.75rem] text-muted">
                    Seconds each image is shown in playlist mode
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={playlistImageDuration}
                  onChange={(e) => setPlaylistImageDuration(Number(e.target.value))}
                  className="w-16 rounded-sm border border-border bg-background px-2 py-1 text-center text-[0.85rem] text-foreground outline-none focus:border-accent"
                />
                <span className="text-[0.8rem] text-muted">s</span>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-surface2 px-4 py-3">
              <div className="flex items-center gap-3">
                <MessageSquare size={18} className="text-muted" />
                <div>
                  <span className="text-[0.9rem]">Show messages in playlist</span>
                  <p className="text-[0.75rem] text-muted">
                    Include text messages when playing a favourites list
                  </p>
                </div>
              </div>
              <button
                onClick={togglePlaylistShowMessages}
                className={`relative h-7 w-[52px] shrink-0 rounded-full transition-colors ${playlistShowMessages ? "bg-accent" : "bg-border"}`}
                title={playlistShowMessages ? "Hide messages in playlist" : "Show messages in playlist"}
              >
                <span
                  className={`absolute top-0.5 left-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white transition-transform ${
                    playlistShowMessages ? "translate-x-[24px]" : ""
                  }`}
                >
                  <MessageSquare size={12} />
                </span>
              </button>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-surface2 px-4 py-3">
              <div className="flex items-center gap-3">
                <Clock size={18} className="text-muted" />
                <div>
                  <span className="text-[0.9rem]">Message display duration</span>
                  <p className="text-[0.75rem] text-muted">
                    Seconds each text message is shown in playlist mode
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={playlistMessageDuration}
                  onChange={(e) => setPlaylistMessageDuration(Number(e.target.value))}
                  className="w-16 rounded-sm border border-border bg-background px-2 py-1 text-center text-[0.85rem] text-foreground outline-none focus:border-accent"
                />
                <span className="text-[0.8rem] text-muted">s</span>
              </div>
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
