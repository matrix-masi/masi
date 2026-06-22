export interface SessionData {
  baseUrl: string;
  userId: string;
  accessToken: string;
  deviceId: string;
}

export interface SwarmAccount {
  id: string;
  baseUrl: string;
  userId: string;
  accessToken: string;
  deviceId: string;
  password?: string;
}

export interface Swarm {
  id: string;
  name: string;
  accounts: SwarmAccount[];
  recoveryKeysBase64?: string[];
  passwordHint?: string;
  lockSalt?: string;
  lockVerifier?: string;
  encryptedCredentials?: {
    salt: string;
    iv: string;
    ciphertext: string;
  };
}

export interface SwarmConfig {
  swarms: Swarm[];
  activeSwarmId: string;
}

export interface AppPreferences {
  theme: "light" | "dark";
  hideMedia: boolean;
  sendMarkdown: boolean;
  sendReadReceipts: boolean;
  playlistImageDuration: number;
  playlistShowMessages: boolean;
  playlistMessageDuration: number;
  swarmFailoverTimeout: number;
  swarmSecondarySyncIntervalMinutes: number;
  swarmMissedEventsThreshold: number;
  storeAccountPasswords: boolean;
  customRoomSearchServers: string[];
  allowNsfwRooms: boolean;
}

export interface ScheduledMessageAttachment {
  msgtype: "m.image" | "m.video";
  body: string;
  url?: string;
  file?: Record<string, unknown>;
  info: Record<string, unknown>;
}

export interface ScheduledMessagePayload {
  version: 1;
  id: string;
  swarmId: string;
  createdAt: number;
  scheduledAt: number;
  timezone: string;
  to: string;
  targetRoomId?: string;
  message: string;
  markdown: boolean;
  attachments: ScheduledMessageAttachment[];
  attempts: number;
  lastAttemptAt?: number;
  lastError?: string;
  pausedUntil?: number;
  sentPartKeys?: string[];
}

export interface AppConfig {
  swarmConfig: SwarmConfig;
  preferences: AppPreferences;
}

export interface EncryptedPayload {
  version: 1;
  salt: string;
  iv: string;
  ciphertext: string;
  payloadType: "appConfig" | "swarmConfig";
}

export interface SwarmPublicMeta {
  id: string;
  name: string;
  passwordHint?: string;
  lockSalt?: string;
  lockVerifier?: string;
}

export interface EncryptedAppConfigEnvelope {
  encrypted: true;
  version: 1;
  masterPasswordHint?: string;
  masterLockSalt: string;
  masterLockVerifier: string;
  swarms: SwarmPublicMeta[];
  activeSwarmId: string;
  payload: {
    salt: string;
    iv: string;
    ciphertext: string;
  };
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  theme: "dark",
  hideMedia: false,
  sendMarkdown: true,
  sendReadReceipts: true,
  playlistImageDuration: 5,
  playlistShowMessages: true,
  playlistMessageDuration: 5,
  swarmFailoverTimeout: 5,
  swarmSecondarySyncIntervalMinutes: 2,
  swarmMissedEventsThreshold: 3,
  storeAccountPasswords: false,
  customRoomSearchServers: [],
  allowNsfwRooms: true,
};
