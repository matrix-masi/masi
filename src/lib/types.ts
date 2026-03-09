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
