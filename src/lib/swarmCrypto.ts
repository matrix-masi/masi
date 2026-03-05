import type { AppConfig, SwarmConfig, EncryptedPayload } from "./types";

const PBKDF2_ITERATIONS = 100_000;

async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function encrypt(
  plaintext: string,
  password: string,
): Promise<{ salt: string; iv: string; ciphertext: string }> {
  const salt = crypto.getRandomValues(
    new Uint8Array(16) as Uint8Array<ArrayBuffer>,
  );
  const iv = crypto.getRandomValues(
    new Uint8Array(12) as Uint8Array<ArrayBuffer>,
  );
  const key = await deriveKey(password, salt);
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext),
  );
  return {
    salt: toBase64(salt.buffer),
    iv: toBase64(iv.buffer),
    ciphertext: toBase64(encrypted),
  };
}

async function decrypt(
  salt: string,
  iv: string,
  ciphertext: string,
  password: string,
): Promise<string> {
  const key = await deriveKey(password, fromBase64(salt));
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    key,
    fromBase64(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

export interface AppConfigWithPasswords {
  swarmConfig: SwarmConfig & {
    swarms: Array<
      SwarmConfig["swarms"][number] & {
        accounts: Array<
          SwarmConfig["swarms"][number]["accounts"][number] & {
            password?: string;
          }
        >;
      }
    >;
  };
  preferences: AppConfig["preferences"];
}

export async function exportAppConfig(
  config: AppConfigWithPasswords,
  masterPassword: string,
): Promise<EncryptedPayload> {
  const { salt, iv, ciphertext } = await encrypt(
    JSON.stringify(config),
    masterPassword,
  );
  return { version: 1, salt, iv, ciphertext, payloadType: "appConfig" };
}

export async function importAppConfig(
  blob: EncryptedPayload,
  masterPassword: string,
): Promise<AppConfigWithPasswords> {
  const json = await decrypt(blob.salt, blob.iv, blob.ciphertext, masterPassword);
  return JSON.parse(json) as AppConfigWithPasswords;
}

export async function exportSwarmConfig(
  config: AppConfigWithPasswords["swarmConfig"],
  masterPassword: string,
): Promise<EncryptedPayload> {
  const { salt, iv, ciphertext } = await encrypt(
    JSON.stringify(config),
    masterPassword,
  );
  return { version: 1, salt, iv, ciphertext, payloadType: "swarmConfig" };
}

export async function importSwarmConfig(
  blob: EncryptedPayload,
  masterPassword: string,
): Promise<AppConfigWithPasswords["swarmConfig"]> {
  const json = await decrypt(blob.salt, blob.iv, blob.ciphertext, masterPassword);
  return JSON.parse(json) as AppConfigWithPasswords["swarmConfig"];
}

export async function createSwarmLockVerifier(
  password: string,
): Promise<{ lockSalt: string; lockVerifier: string }> {
  const salt = crypto.getRandomValues(
    new Uint8Array(16) as Uint8Array<ArrayBuffer>,
  );
  const key = await deriveKey(password, salt);
  const marker = new TextEncoder().encode("swarm-lock-verify");
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(12) as Uint8Array<ArrayBuffer>,
    },
    key,
    marker,
  );
  return {
    lockSalt: toBase64(salt.buffer),
    lockVerifier: toBase64(encrypted),
  };
}

export async function verifySwarmLockPassword(
  password: string,
  lockSalt: string,
  lockVerifier: string,
): Promise<boolean> {
  try {
    const key = await deriveKey(password, fromBase64(lockSalt));
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(12) as Uint8Array<ArrayBuffer>,
      },
      key,
      fromBase64(lockVerifier),
    );
    const text = new TextDecoder().decode(decrypted);
    return text === "swarm-lock-verify";
  } catch {
    return false;
  }
}

export async function encryptSwarmCredentials(
  data: string,
  password: string,
): Promise<{ salt: string; iv: string; ciphertext: string }> {
  return encrypt(data, password);
}

export async function decryptSwarmCredentials(
  salt: string,
  iv: string,
  ciphertext: string,
  password: string,
): Promise<string> {
  return decrypt(salt, iv, ciphertext, password);
}
