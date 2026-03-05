import type { MatrixClient } from "matrix-js-sdk";

const blobUrlCache = new Map<string, Promise<string | null>>();

export function clearBlobCache(): void {
  for (const entry of blobUrlCache.values()) {
    Promise.resolve(entry).then((url) => {
      if (url) URL.revokeObjectURL(url);
    });
  }
  blobUrlCache.clear();
}

interface EncryptedFile {
  url: string;
  key: { k: string };
  iv: string;
}

interface MediaContent {
  url?: string;
  file?: EncryptedFile;
  body?: string;
  info?: {
    mimetype?: string;
    thumbnail_url?: string;
    thumbnail_file?: EncryptedFile;
    thumbnail_info?: { mimetype?: string };
  };
}

function getMediaUrl(content: MediaContent): string | null {
  return content.url || content.file?.url || null;
}

function getMediaFile(content: MediaContent): EncryptedFile | null {
  return content.file || null;
}

function getThumbnailUrl(content: MediaContent): string | null {
  return content.info?.thumbnail_url || content.info?.thumbnail_file?.url || null;
}

function getThumbnailFile(content: MediaContent): EncryptedFile | null {
  return content.info?.thumbnail_file || null;
}

interface FetchMediaOpts {
  thumbnail?: boolean;
  width?: number;
  height?: number;
  resizeMethod?: string;
  fallbackClients?: MatrixClient[];
}

export function fetchMedia(
  content: MediaContent,
  client: MatrixClient,
  opts: FetchMediaOpts = {}
): Promise<string | null> {
  const { thumbnail = false, width, height, resizeMethod, fallbackClients } = opts;
  const encFile = thumbnail ? getThumbnailFile(content) : getMediaFile(content);
  const mxcUrl = thumbnail
    ? getThumbnailUrl(content) || getMediaUrl(content)
    : getMediaUrl(content);

  if (encFile) {
    const mimetype = thumbnail
      ? content.info?.thumbnail_info?.mimetype || content.info?.mimetype
      : content.info?.mimetype;
    return fetchAndDecryptMedia(client, encFile, mimetype, width, height, resizeMethod, fallbackClients);
  }
  return fetchAuthenticatedMedia(client, mxcUrl, width, height, resizeMethod, fallbackClients);
}

export async function fetchAuthenticatedMedia(
  client: MatrixClient,
  mxcUrl: string | null | undefined,
  width?: number,
  height?: number,
  resizeMethod?: string,
  fallbackClients?: MatrixClient[],
): Promise<string | null> {
  if (!mxcUrl) return null;

  const result = await tryFetchWithClient(client, mxcUrl, width, height, resizeMethod);
  if (result) return result;

  if (fallbackClients) {
    for (const fc of fallbackClients) {
      if (fc === client) continue;
      const fbResult = await tryFetchWithClient(fc, mxcUrl, width, height, resizeMethod);
      if (fbResult) return fbResult;
    }
  }
  return null;
}

async function tryFetchWithClient(
  client: MatrixClient,
  mxcUrl: string,
  width?: number,
  height?: number,
  resizeMethod?: string,
): Promise<string | null> {
  if (!client) return null;
  const userId = client.getUserId() || "";
  const cacheKey = `${mxcUrl}|${width || ""}|${height || ""}|${resizeMethod || ""}|${userId}`;
  if (blobUrlCache.has(cacheKey)) return blobUrlCache.get(cacheKey)!;

  const httpUrl = client.mxcUrlToHttp(
    mxcUrl,
    width,
    height,
    resizeMethod,
    false,
    true,
    true
  );
  if (!httpUrl) return null;

  const promise = fetch(httpUrl, {
    headers: { Authorization: `Bearer ${client.getAccessToken()}` },
  })
    .then((resp) => {
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.blob();
    })
    .then((blob) => URL.createObjectURL(blob))
    .catch(() => {
      blobUrlCache.delete(cacheKey);
      return null;
    });

  blobUrlCache.set(cacheKey, promise);
  return promise;
}

function base64UrlToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function decryptAttachment(
  encryptedData: ArrayBuffer,
  fileInfo: EncryptedFile
): Promise<Uint8Array<ArrayBuffer>> {
  const keyData = base64UrlToUint8Array(fileInfo.key.k);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-CTR" },
    false,
    ["decrypt"]
  );
  const iv = base64ToUint8Array(fileInfo.iv);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-CTR", counter: iv, length: 64 },
    cryptoKey,
    encryptedData
  );
  return new Uint8Array(decrypted) as Uint8Array<ArrayBuffer>;
}

async function fetchAndDecryptMedia(
  client: MatrixClient,
  encFile: EncryptedFile,
  mimetype?: string,
  width?: number,
  height?: number,
  resizeMethod?: string,
  fallbackClients?: MatrixClient[],
): Promise<string | null> {
  const result = await tryDecryptWithClient(client, encFile, mimetype, width, height, resizeMethod);
  if (result) return result;

  if (fallbackClients) {
    for (const fc of fallbackClients) {
      if (fc === client) continue;
      const fbResult = await tryDecryptWithClient(fc, encFile, mimetype, width, height, resizeMethod);
      if (fbResult) return fbResult;
    }
  }
  return null;
}

async function tryDecryptWithClient(
  client: MatrixClient,
  encFile: EncryptedFile,
  mimetype?: string,
  width?: number,
  height?: number,
  resizeMethod?: string,
): Promise<string | null> {
  const mxcUrl = encFile.url;
  if (!mxcUrl || !client) return null;
  const userId = client.getUserId() || "";
  const cacheKey = `enc|${mxcUrl}|${userId}`;
  if (blobUrlCache.has(cacheKey)) return blobUrlCache.get(cacheKey)!;

  const httpUrl = client.mxcUrlToHttp(
    mxcUrl,
    width,
    height,
    resizeMethod,
    false,
    true,
    true
  );
  if (!httpUrl) return null;

  const promise = fetch(httpUrl, {
    headers: { Authorization: `Bearer ${client.getAccessToken()}` },
  })
    .then((resp) => {
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.arrayBuffer();
    })
    .then((encrypted) => decryptAttachment(encrypted, encFile))
    .then((decrypted) => {
      const blob = new Blob([decrypted], {
        type: mimetype || "application/octet-stream",
      });
      return URL.createObjectURL(blob);
    })
    .catch((err) => {
      console.error("Failed to decrypt media:", err);
      blobUrlCache.delete(cacheKey);
      return null;
    });

  blobUrlCache.set(cacheKey, promise);
  return promise;
}
