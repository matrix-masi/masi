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
}

export function fetchMedia(
  content: MediaContent,
  client: MatrixClient,
  opts: FetchMediaOpts = {}
): Promise<string | null> {
  const { thumbnail = false, width, height, resizeMethod } = opts;
  const encFile = thumbnail ? getThumbnailFile(content) : getMediaFile(content);
  const mxcUrl = thumbnail
    ? getThumbnailUrl(content) || getMediaUrl(content)
    : getMediaUrl(content);

  if (encFile) {
    const mimetype = thumbnail
      ? content.info?.thumbnail_info?.mimetype || content.info?.mimetype
      : content.info?.mimetype;
    return fetchAndDecryptMedia(client, encFile, mimetype, width, height, resizeMethod);
  }
  return fetchAuthenticatedMedia(client, mxcUrl, width, height, resizeMethod);
}

export function fetchAuthenticatedMedia(
  client: MatrixClient,
  mxcUrl: string | null | undefined,
  width?: number,
  height?: number,
  resizeMethod?: string
): Promise<string | null> {
  if (!mxcUrl || !client) return Promise.resolve(null);
  const cacheKey = `${mxcUrl}|${width || ""}|${height || ""}|${resizeMethod || ""}`;
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
  if (!httpUrl) return Promise.resolve(null);

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

function fetchAndDecryptMedia(
  client: MatrixClient,
  encFile: EncryptedFile,
  mimetype?: string,
  width?: number,
  height?: number,
  resizeMethod?: string
): Promise<string | null> {
  const mxcUrl = encFile.url;
  if (!mxcUrl || !client) return Promise.resolve(null);
  const cacheKey = `enc|${mxcUrl}`;
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
  if (!httpUrl) return Promise.resolve(null);

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
