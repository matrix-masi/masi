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
}

export interface Swarm {
  id: string;
  name: string;
  accounts: SwarmAccount[];
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
};
