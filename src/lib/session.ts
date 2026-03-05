import type {
  SessionData,
  AppConfig,
  SwarmConfig,
  SwarmAccount,
  EncryptedAppConfigEnvelope,
  SwarmPublicMeta,
} from "./types";
import { DEFAULT_PREFERENCES } from "./types";
import {
  createMasterLockVerifier,
  verifyMasterLockPassword,
  encryptAppConfigPayload,
  decryptAppConfigPayload,
} from "./swarmCrypto";

const APP_CONFIG_KEY = "app_config";
const LEGACY_KEY = "matrix_session";

let decryptedConfig: AppConfig | null = null;
let sessionPassword: string | null = null;
let storageEncrypted = false;

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
      else if (v === "false")
        (prefs as Record<string, unknown>)[prefKey] = false;
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

function isEnvelope(
  obj: unknown,
): obj is EncryptedAppConfigEnvelope {
  return (
    typeof obj === "object" &&
    obj !== null &&
    (obj as Record<string, unknown>).encrypted === true
  );
}

function readRawStorage(): AppConfig | EncryptedAppConfigEnvelope | null {
  try {
    const raw = localStorage.getItem(APP_CONFIG_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AppConfig | EncryptedAppConfigEnvelope;
  } catch {
    return null;
  }
}

function buildEnvelope(
  config: AppConfig,
  payload: { salt: string; iv: string; ciphertext: string },
  masterLockSalt: string,
  masterLockVerifier: string,
  masterPasswordHint?: string,
): EncryptedAppConfigEnvelope {
  const swarms: SwarmPublicMeta[] = config.swarmConfig.swarms.map((s) => ({
    id: s.id,
    name: s.name,
    passwordHint: s.passwordHint,
    lockSalt: s.lockSalt,
    lockVerifier: s.lockVerifier,
  }));
  return {
    encrypted: true,
    version: 1,
    masterPasswordHint,
    masterLockSalt,
    masterLockVerifier,
    swarms,
    activeSwarmId: config.swarmConfig.activeSwarmId,
    payload,
  };
}

function toStorageSafeSwarms(
  swarms: AppConfig["swarmConfig"]["swarms"],
): AppConfig["swarmConfig"]["swarms"] {
  return swarms.map((s) =>
    s.encryptedCredentials
      ? {
          id: s.id,
          name: s.name,
          accounts: [],
          passwordHint: s.passwordHint,
          lockSalt: s.lockSalt,
          lockVerifier: s.lockVerifier,
          encryptedCredentials: s.encryptedCredentials,
        }
      : s,
  );
}

export type StorageKind = "none" | "plaintext" | "encrypted";

export function getStorageKind(): StorageKind {
  const obj = readRawStorage();
  if (!obj) return "none";
  if (isEnvelope(obj)) return "encrypted";
  return "plaintext";
}

export function getEncryptedEnvelope(): EncryptedAppConfigEnvelope | null {
  const obj = readRawStorage();
  if (obj && isEnvelope(obj)) return obj;
  return null;
}

export function isAppConfigEncrypted(): boolean {
  return storageEncrypted;
}

export function initStorageState(): void {
  const kind = getStorageKind();
  storageEncrypted = kind === "encrypted";
}

export function saveAppConfig(config: AppConfig): void {
  decryptedConfig = config;
  if (storageEncrypted && sessionPassword) {
    encryptAndSave(config, sessionPassword).catch((err) =>
      console.error("Failed to encrypt app config on save", err),
    );
    return;
  }
  const safe: AppConfig = {
    ...config,
    swarmConfig: {
      ...config.swarmConfig,
      swarms: toStorageSafeSwarms(config.swarmConfig.swarms),
    },
  };
  localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(safe));
}

async function encryptAndSave(
  config: AppConfig,
  password: string,
): Promise<void> {
  const existingEnvelope = getEncryptedEnvelope();
  const safeSwarms = toStorageSafeSwarms(config.swarmConfig.swarms);
  const payload = await encryptAppConfigPayload(
    JSON.stringify({
      preferences: config.preferences,
      swarms: safeSwarms,
    }),
    password,
  );
  const envelope = buildEnvelope(
    config,
    payload,
    existingEnvelope?.masterLockSalt ?? "",
    existingEnvelope?.masterLockVerifier ?? "",
    existingEnvelope?.masterPasswordHint,
  );
  decryptedConfig = config;
  localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(envelope));
}

export function loadAppConfig(): AppConfig | null {
  if (decryptedConfig) return decryptedConfig;
  try {
    const raw = localStorage.getItem(APP_CONFIG_KEY);
    if (!raw) return migrateLegacySession();
    const obj = JSON.parse(raw);
    if (isEnvelope(obj)) return null;
    const config = obj as AppConfig;
    decryptedConfig = config;
    return config;
  } catch {
    return null;
  }
}

export async function unlockMasterPassword(
  password: string,
): Promise<boolean> {
  const envelope = getEncryptedEnvelope();
  if (!envelope) return false;

  const ok = await verifyMasterLockPassword(
    password,
    envelope.masterLockSalt,
    envelope.masterLockVerifier,
  );
  if (!ok) return false;

  try {
    const json = await decryptAppConfigPayload(envelope.payload, password);
    const inner = JSON.parse(json) as {
      preferences: AppConfig["preferences"];
      swarms: AppConfig["swarmConfig"]["swarms"];
    };
    const config: AppConfig = {
      swarmConfig: {
        swarms: inner.swarms,
        activeSwarmId: envelope.activeSwarmId,
      },
      preferences: inner.preferences ?? { ...DEFAULT_PREFERENCES },
    };
    decryptedConfig = config;
    sessionPassword = password;
    storageEncrypted = true;
    return true;
  } catch {
    return false;
  }
}

export async function enableMasterEncryption(
  config: AppConfig,
  password: string,
  hint?: string,
): Promise<void> {
  const { masterLockSalt, masterLockVerifier } =
    await createMasterLockVerifier(password);

  const safeSwarms = toStorageSafeSwarms(config.swarmConfig.swarms);
  const payload = await encryptAppConfigPayload(
    JSON.stringify({
      preferences: config.preferences,
      swarms: safeSwarms,
    }),
    password,
  );

  const envelope = buildEnvelope(
    config,
    payload,
    masterLockSalt,
    masterLockVerifier,
    hint,
  );

  localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(envelope));
  decryptedConfig = config;
  sessionPassword = password;
  storageEncrypted = true;
}

export async function disableMasterEncryption(
  password: string,
): Promise<boolean> {
  const envelope = getEncryptedEnvelope();
  if (!envelope) return false;

  const ok = await verifyMasterLockPassword(
    password,
    envelope.masterLockSalt,
    envelope.masterLockVerifier,
  );
  if (!ok) return false;

  let config: AppConfig;
  if (decryptedConfig) {
    config = decryptedConfig;
  } else {
    try {
      const json = await decryptAppConfigPayload(envelope.payload, password);
      const inner = JSON.parse(json) as {
        preferences: AppConfig["preferences"];
        swarms: AppConfig["swarmConfig"]["swarms"];
      };
      config = {
        swarmConfig: {
          swarms: inner.swarms,
          activeSwarmId: envelope.activeSwarmId,
        },
        preferences: inner.preferences ?? { ...DEFAULT_PREFERENCES },
      };
    } catch {
      return false;
    }
  }

  sessionPassword = null;
  storageEncrypted = false;
  decryptedConfig = config;
  const safe: AppConfig = {
    ...config,
    swarmConfig: {
      ...config.swarmConfig,
      swarms: toStorageSafeSwarms(config.swarmConfig.swarms),
    },
  };
  localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(safe));
  return true;
}

export function clearAppConfig(): void {
  localStorage.removeItem(APP_CONFIG_KEY);
  localStorage.removeItem(LEGACY_KEY);
  decryptedConfig = null;
  sessionPassword = null;
  storageEncrypted = false;
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
