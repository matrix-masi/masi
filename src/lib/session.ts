import type { SessionData, AppConfig, SwarmConfig, SwarmAccount } from "./types";
import { DEFAULT_PREFERENCES } from "./types";

const APP_CONFIG_KEY = "app_config";
const LEGACY_KEY = "matrix_session";

function generateId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
}

function migrateLegacySession(): AppConfig | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const sess = JSON.parse(raw) as SessionData;
    const account: SwarmAccount = {
      id: generateId(),
      baseUrl: sess.baseUrl,
      userId: sess.userId,
      accessToken: sess.accessToken,
      deviceId: sess.deviceId,
    };
    const swarmId = generateId();
    const config: AppConfig = {
      swarmConfig: {
        swarms: [{ id: swarmId, name: "My Swarm", accounts: [account] }],
        activeSwarmId: swarmId,
      },
      preferences: migrateLegacyPreferences(),
    };
    localStorage.removeItem(LEGACY_KEY);
    saveAppConfig(config);
    return config;
  } catch {
    return null;
  }
}

function migrateLegacyPreferences(): AppConfig["preferences"] {
  const prefs = { ...DEFAULT_PREFERENCES };
  try {
    const theme = localStorage.getItem("theme");
    if (theme === "light" || theme === "dark") prefs.theme = theme;

    const boolKeys: Array<[string, keyof typeof prefs]> = [
      ["setting_hideMedia", "hideMedia"],
      ["setting_sendMarkdown", "sendMarkdown"],
      ["setting_sendReadReceipts", "sendReadReceipts"],
      ["setting_playlistShowMessages", "playlistShowMessages"],
    ];
    for (const [lsKey, prefKey] of boolKeys) {
      const v = localStorage.getItem(lsKey);
      if (v === "true") (prefs as Record<string, unknown>)[prefKey] = true;
      else if (v === "false") (prefs as Record<string, unknown>)[prefKey] = false;
    }

    const numKeys: Array<[string, keyof typeof prefs]> = [
      ["setting_playlistImageDuration", "playlistImageDuration"],
      ["setting_playlistMessageDuration", "playlistMessageDuration"],
    ];
    for (const [lsKey, prefKey] of numKeys) {
      const v = localStorage.getItem(lsKey);
      if (v !== null) {
        const n = Number(v);
        if (!Number.isNaN(n) && n > 0)
          (prefs as Record<string, unknown>)[prefKey] = n;
      }
    }
  } catch {}
  return prefs;
}

export function saveAppConfig(config: AppConfig): void {
  localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(config));
}

export function loadAppConfig(): AppConfig | null {
  try {
    const raw = localStorage.getItem(APP_CONFIG_KEY);
    if (raw) return JSON.parse(raw) as AppConfig;
    return migrateLegacySession();
  } catch {
    return null;
  }
}

export function clearAppConfig(): void {
  localStorage.removeItem(APP_CONFIG_KEY);
  localStorage.removeItem(LEGACY_KEY);
}

export function updateSwarmConfig(
  updater: (current: SwarmConfig) => SwarmConfig,
): AppConfig | null {
  const config = loadAppConfig();
  if (!config) return null;
  config.swarmConfig = updater(config.swarmConfig);
  saveAppConfig(config);
  return config;
}

export function updatePreferences(
  updater: (current: AppConfig["preferences"]) => AppConfig["preferences"],
): AppConfig | null {
  const config = loadAppConfig();
  if (!config) return null;
  config.preferences = updater(config.preferences);
  saveAppConfig(config);
  return config;
}

export { generateId };
