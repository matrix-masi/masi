import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

interface SettingsContextValue {
  hideMedia: boolean;
  toggleHideMedia: () => void;
  sendMarkdown: boolean;
  toggleSendMarkdown: () => void;
  sendReadReceipts: boolean;
  toggleSendReadReceipts: () => void;

  playlistImageDuration: number;
  setPlaylistImageDuration: (s: number) => void;
  playlistShowMessages: boolean;
  togglePlaylistShowMessages: () => void;
  playlistMessageDuration: number;
  setPlaylistMessageDuration: (s: number) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === "true") return true;
    if (v === "false") return false;
  } catch {}
  return fallback;
}

function loadNumber(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) {
      const n = Number(v);
      if (!Number.isNaN(n) && n > 0) return n;
    }
  } catch {}
  return fallback;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [hideMedia, setHideMedia] = useState(() =>
    loadBool("setting_hideMedia", false),
  );
  const [sendMarkdown, setSendMarkdown] = useState(() =>
    loadBool("setting_sendMarkdown", true),
  );
  const [sendReadReceipts, setSendReadReceipts] = useState(() =>
    loadBool("setting_sendReadReceipts", true),
  );
  const [playlistImageDuration, _setPlaylistImageDuration] = useState(() =>
    loadNumber("setting_playlistImageDuration", 5),
  );
  const [playlistShowMessages, setPlaylistShowMessages] = useState(() =>
    loadBool("setting_playlistShowMessages", true),
  );
  const [playlistMessageDuration, _setPlaylistMessageDuration] = useState(() =>
    loadNumber("setting_playlistMessageDuration", 5),
  );

  const toggleHideMedia = useCallback(() => {
    setHideMedia((prev) => {
      const next = !prev;
      localStorage.setItem("setting_hideMedia", String(next));
      return next;
    });
  }, []);

  const toggleSendMarkdown = useCallback(() => {
    setSendMarkdown((prev) => {
      const next = !prev;
      localStorage.setItem("setting_sendMarkdown", String(next));
      return next;
    });
  }, []);

  const toggleSendReadReceipts = useCallback(() => {
    setSendReadReceipts((prev) => {
      const next = !prev;
      localStorage.setItem("setting_sendReadReceipts", String(next));
      return next;
    });
  }, []);

  const togglePlaylistShowMessages = useCallback(() => {
    setPlaylistShowMessages((prev) => {
      const next = !prev;
      localStorage.setItem("setting_playlistShowMessages", String(next));
      return next;
    });
  }, []);

  const setPlaylistImageDuration = useCallback((s: number) => {
    const clamped = Math.max(1, Math.round(s));
    _setPlaylistImageDuration(clamped);
    localStorage.setItem("setting_playlistImageDuration", String(clamped));
  }, []);

  const setPlaylistMessageDuration = useCallback((s: number) => {
    const clamped = Math.max(1, Math.round(s));
    _setPlaylistMessageDuration(clamped);
    localStorage.setItem("setting_playlistMessageDuration", String(clamped));
  }, []);

  return (
    <SettingsContext.Provider
      value={{
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
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx)
    throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
