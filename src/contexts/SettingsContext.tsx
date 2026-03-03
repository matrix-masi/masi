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

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [hideMedia, setHideMedia] = useState(() =>
    loadBool("setting_hideMedia", false),
  );
  const [sendMarkdown, setSendMarkdown] = useState(() =>
    loadBool("setting_sendMarkdown", true),
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

  return (
    <SettingsContext.Provider
      value={{
        hideMedia,
        toggleHideMedia,
        sendMarkdown,
        toggleSendMarkdown,
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
