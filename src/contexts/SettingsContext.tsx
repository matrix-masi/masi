import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { loadAppConfig, updatePreferences } from "../lib/session";
import { DEFAULT_PREFERENCES } from "../lib/types";

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

  swarmFailoverTimeout: number;
  setSwarmFailoverTimeout: (s: number) => void;
  swarmSecondarySyncIntervalMinutes: number;
  setSwarmSecondarySyncIntervalMinutes: (m: number) => void;
  swarmMissedEventsThreshold: number;
  setSwarmMissedEventsThreshold: (n: number) => void;

  storeAccountPasswords: boolean;
  setStoreAccountPasswords: (v: boolean) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function loadPref<K extends keyof typeof DEFAULT_PREFERENCES>(
  key: K,
): (typeof DEFAULT_PREFERENCES)[K] {
  const config = loadAppConfig();
  if (config?.preferences && key in config.preferences)
    return config.preferences[key];

  const lsMap: Record<string, string> = {
    hideMedia: "setting_hideMedia",
    sendMarkdown: "setting_sendMarkdown",
    sendReadReceipts: "setting_sendReadReceipts",
    playlistShowMessages: "setting_playlistShowMessages",
    playlistImageDuration: "setting_playlistImageDuration",
    playlistMessageDuration: "setting_playlistMessageDuration",
  };
  const lsKey = lsMap[key];
  if (lsKey) {
    try {
      const v = localStorage.getItem(lsKey);
      if (v !== null) {
        if (v === "true") return true as (typeof DEFAULT_PREFERENCES)[K];
        if (v === "false") return false as (typeof DEFAULT_PREFERENCES)[K];
        const n = Number(v);
        if (!Number.isNaN(n) && n > 0)
          return n as (typeof DEFAULT_PREFERENCES)[K];
      }
    } catch {}
  }
  return DEFAULT_PREFERENCES[key];
}

function savePref<K extends keyof typeof DEFAULT_PREFERENCES>(
  key: K,
  value: (typeof DEFAULT_PREFERENCES)[K],
) {
  updatePreferences((prev) => ({ ...prev, [key]: value }));
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [hideMedia, setHideMedia] = useState(() => loadPref("hideMedia"));
  const [sendMarkdown, setSendMarkdown] = useState(() =>
    loadPref("sendMarkdown"),
  );
  const [sendReadReceipts, setSendReadReceipts] = useState(() =>
    loadPref("sendReadReceipts"),
  );
  const [playlistImageDuration, _setPlaylistImageDuration] = useState(() =>
    loadPref("playlistImageDuration"),
  );
  const [playlistShowMessages, setPlaylistShowMessages] = useState(() =>
    loadPref("playlistShowMessages"),
  );
  const [playlistMessageDuration, _setPlaylistMessageDuration] = useState(() =>
    loadPref("playlistMessageDuration"),
  );
  const [swarmFailoverTimeout, _setSwarmFailoverTimeout] = useState(() =>
    loadPref("swarmFailoverTimeout"),
  );
  const [swarmSecondarySyncIntervalMinutes, _setSwarmSecondarySyncInterval] =
    useState(() => loadPref("swarmSecondarySyncIntervalMinutes"));
  const [swarmMissedEventsThreshold, _setSwarmMissedEventsThreshold] =
    useState(() => loadPref("swarmMissedEventsThreshold"));
  const [storeAccountPasswords, _setStoreAccountPasswords] = useState(() =>
    loadPref("storeAccountPasswords"),
  );

  const toggleHideMedia = useCallback(() => {
    setHideMedia((prev) => {
      const next = !prev;
      savePref("hideMedia", next);
      return next;
    });
  }, []);

  const toggleSendMarkdown = useCallback(() => {
    setSendMarkdown((prev) => {
      const next = !prev;
      savePref("sendMarkdown", next);
      return next;
    });
  }, []);

  const toggleSendReadReceipts = useCallback(() => {
    setSendReadReceipts((prev) => {
      const next = !prev;
      savePref("sendReadReceipts", next);
      return next;
    });
  }, []);

  const togglePlaylistShowMessages = useCallback(() => {
    setPlaylistShowMessages((prev) => {
      const next = !prev;
      savePref("playlistShowMessages", next);
      return next;
    });
  }, []);

  const setPlaylistImageDuration = useCallback((s: number) => {
    const clamped = Math.max(1, Math.round(s));
    _setPlaylistImageDuration(clamped);
    savePref("playlistImageDuration", clamped);
  }, []);

  const setPlaylistMessageDuration = useCallback((s: number) => {
    const clamped = Math.max(1, Math.round(s));
    _setPlaylistMessageDuration(clamped);
    savePref("playlistMessageDuration", clamped);
  }, []);

  const setSwarmFailoverTimeout = useCallback((s: number) => {
    const clamped = Math.max(1, Math.round(s));
    _setSwarmFailoverTimeout(clamped);
    savePref("swarmFailoverTimeout", clamped);
  }, []);

  const setSwarmSecondarySyncIntervalMinutes = useCallback((m: number) => {
    const clamped = Math.max(1, Math.min(5, Math.round(m)));
    _setSwarmSecondarySyncInterval(clamped);
    savePref("swarmSecondarySyncIntervalMinutes", clamped);
  }, []);

  const setSwarmMissedEventsThreshold = useCallback((n: number) => {
    const clamped = Math.max(1, Math.round(n));
    _setSwarmMissedEventsThreshold(clamped);
    savePref("swarmMissedEventsThreshold", clamped);
  }, []);

  const setStoreAccountPasswords = useCallback((v: boolean) => {
    _setStoreAccountPasswords(v);
    savePref("storeAccountPasswords", v);
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
        swarmFailoverTimeout,
        setSwarmFailoverTimeout,
        swarmSecondarySyncIntervalMinutes,
        setSwarmSecondarySyncIntervalMinutes,
        swarmMissedEventsThreshold,
        setSwarmMissedEventsThreshold,
        storeAccountPasswords,
        setStoreAccountPasswords,
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
