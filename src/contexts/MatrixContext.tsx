import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import * as sdk from "matrix-js-sdk";
import { decodeRecoveryKey } from "matrix-js-sdk/lib/crypto-api/recovery-key";
import type { SessionData } from "../lib/types";
import { saveSession, loadSession, clearSession } from "../lib/session";
import { clearBlobCache } from "../lib/media";

interface LightboxTarget {
  type: "image" | "video";
  content: Record<string, unknown>;
}

interface MatrixContextValue {
  client: sdk.MatrixClient | null;
  currentRoomId: string | null;
  setCurrentRoomId: (id: string | null) => void;
  cryptoAvailable: boolean;
  syncState: string | null;
  roomListVersion: number;
  session: SessionData | null;
  login: (baseUrl: string, user: string, password: string) => Promise<void>;
  logout: () => void;
  initFromSession: (session: SessionData) => void;

  lightboxTarget: LightboxTarget | null;
  openLightbox: (type: "image" | "video", content: Record<string, unknown>) => void;
  closeLightbox: () => void;

  showRecoveryModal: boolean;
  openRecoveryModal: () => void;
  submitRecoveryKey: (key: string) => Promise<void>;
  cancelRecovery: () => void;
  recoveryError: string | null;
  recoveryLoading: boolean;

  showCryptoBanner: boolean;
  setShowCryptoBanner: (v: boolean) => void;
}

const MatrixContext = createContext<MatrixContextValue | null>(null);

export function useMatrix(): MatrixContextValue {
  const ctx = useContext(MatrixContext);
  if (!ctx) throw new Error("useMatrix must be used within MatrixProvider");
  return ctx;
}

export function MatrixProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<sdk.MatrixClient | null>(null);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [cryptoAvailable, setCryptoAvailable] = useState(false);
  const [syncState, setSyncState] = useState<string | null>(null);
  const [session, setSession] = useState<SessionData | null>(loadSession);
  const [roomListVersion, setRoomListVersion] = useState(0);
  const [lightboxTarget, setLightboxTarget] = useState<LightboxTarget | null>(null);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [showCryptoBanner, setShowCryptoBanner] = useState(false);

  const recoveryKeyBytesRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const recoveryResolveRef = useRef<
    ((decoded: Uint8Array<ArrayBuffer> | null) => void) | null
  >(null);
  const clientRef = useRef<sdk.MatrixClient | null>(null);
  const inflightInitRef = useRef<Promise<void> | null>(null);

  const bumpRoomList = useCallback(() => {
    setRoomListVersion((v) => v + 1);
  }, []);

  const initClient = useCallback(
    async (sess: SessionData) => {
      if (inflightInitRef.current) {
        return inflightInitRef.current;
      }
      const run = async () => {
        const c = sdk.createClient({
          baseUrl: sess.baseUrl,
          userId: sess.userId,
          accessToken: sess.accessToken,
          deviceId: sess.deviceId,
          timelineSupport: true,
          cryptoCallbacks: {
            getSecretStorageKey: async ({ keys }, _name) => {
              if (recoveryKeyBytesRef.current) {
                const keyId = Object.keys(keys)[0];
                return [keyId, recoveryKeyBytesRef.current];
              }
              return new Promise<[string, Uint8Array<ArrayBuffer>] | null>((resolve) => {
                recoveryResolveRef.current = (decoded) => {
                  if (decoded) {
                    const keyId = Object.keys(keys)[0];
                    resolve([keyId, decoded]);
                  } else {
                    resolve(null);
                  }
                };
                setShowRecoveryModal(true);
                setRecoveryError(null);
              });
            },
            cacheSecretStorageKey: (
              _keyId: string,
              _keyInfo: unknown,
              key: Uint8Array<ArrayBuffer>
            ) => {
              recoveryKeyBytesRef.current = key;
            },
          },
        });

        clientRef.current = c;
        setClient(c);

        try {
          await c.initRustCrypto();
          setCryptoAvailable(true);
        } catch (err) {
          console.warn(
            "Crypto init failed, encrypted messages won't be decryptable:",
            err
          );
        }

        c.on(sdk.ClientEvent.Sync, (state: string) => {
          setSyncState(state);
          if (state === "PREPARED" || state === "SYNCING") {
            bumpRoomList();
          }
        });

        c.on(sdk.RoomEvent.Timeline, () => bumpRoomList());
        c.on(sdk.RoomEvent.Name, () => bumpRoomList());
        c.on(sdk.RoomEvent.Receipt, () => bumpRoomList());
        c.on(sdk.RoomEvent.MyMembership, () => bumpRoomList());

        await c.startClient({ initialSyncLimit: 30 });
      };
      const p = run();
      inflightInitRef.current = p;
      p.finally(() => {
        inflightInitRef.current = null;
      });
      return p;
    },
    [bumpRoomList]
  );

  const login = useCallback(
    async (baseUrl: string, user: string, password: string) => {
      const trimmed = baseUrl.replace(/\/+$/, "");
      const tempClient = sdk.createClient({ baseUrl: trimmed });
      const resp = await tempClient.login("m.login.password", {
        user,
        password,
        initial_device_display_name: "Matrix Mini Client",
      });
      const sess: SessionData = {
        baseUrl: trimmed,
        userId: resp.user_id,
        accessToken: resp.access_token,
        deviceId: resp.device_id,
      };
      saveSession(sess);
      setSession(sess);
      tempClient.stopClient();
      await initClient(sess);
    },
    [initClient]
  );

  const logout = useCallback(() => {
    if (!confirm("Sign out?")) return;
    clearBlobCache();
    if (clientRef.current) {
      clientRef.current.stopClient();
      clientRef.current.logout(true).catch(() => {});
    }
    clearSession();
    location.reload();
  }, []);

  const initFromSession = useCallback(
    (sess: SessionData) => {
      initClient(sess);
    },
    [initClient]
  );

  const openLightbox = useCallback(
    (type: "image" | "video", content: Record<string, unknown>) => {
      setLightboxTarget({ type, content });
    },
    []
  );

  const closeLightbox = useCallback(() => {
    setLightboxTarget(null);
  }, []);

  const openRecoveryModal = useCallback(() => {
    setShowRecoveryModal(true);
    setRecoveryError(null);
  }, []);

  const cancelRecovery = useCallback(() => {
    setShowRecoveryModal(false);
    setRecoveryError(null);
    if (recoveryResolveRef.current) {
      recoveryResolveRef.current(null);
      recoveryResolveRef.current = null;
    }
  }, []);

  const submitRecoveryKey = useCallback(
    async (keyStr: string) => {
      let decoded: Uint8Array<ArrayBuffer>;
      try {
        const decodedRaw = decodeRecoveryKey(keyStr);
        decoded = new Uint8Array(decodedRaw) as Uint8Array<ArrayBuffer>;
      } catch {
        setRecoveryError("Invalid recovery key format");
        return;
      }

      recoveryKeyBytesRef.current = decoded;

      if (recoveryResolveRef.current) {
        recoveryResolveRef.current(decoded);
        recoveryResolveRef.current = null;
        setShowRecoveryModal(false);
        setRecoveryError(null);
        return;
      }

      const c = clientRef.current;
      if (!c) {
        setRecoveryError("Client is not initialized");
        return;
      }

      let cryptoModule = c.getCrypto();
      if (!cryptoModule) {
        try {
          await c.initRustCrypto();
          setCryptoAvailable(true);
          cryptoModule = c.getCrypto();
        } catch (initErr) {
          console.error("Crypto initialization failed:", initErr);
        }
        if (!cryptoModule) {
          setRecoveryError("Encryption could not be initialized");
          return;
        }
      }

      setRecoveryLoading(true);
      setRecoveryError(null);

      try {
        await cryptoModule.loadSessionBackupPrivateKeyFromSecretStorage();
        await cryptoModule.checkKeyBackupAndEnable();
        setShowRecoveryModal(false);
        setShowCryptoBanner(false);
      } catch (err: unknown) {
        recoveryKeyBytesRef.current = null;
        setRecoveryError(
          err instanceof Error ? err.message : "Failed to restore keys"
        );
      } finally {
        setRecoveryLoading(false);
      }
    },
    []
  );

  return (
    <MatrixContext.Provider
      value={{
        client,
        currentRoomId,
        setCurrentRoomId,
        cryptoAvailable,
        syncState,
        roomListVersion,
        session,
        login,
        logout,
        initFromSession,
        lightboxTarget,
        openLightbox,
        closeLightbox,
        showRecoveryModal,
        openRecoveryModal,
        submitRecoveryKey,
        cancelRecovery,
        recoveryError,
        recoveryLoading,
        showCryptoBanner,
        setShowCryptoBanner,
      }}
    >
      {children}
    </MatrixContext.Provider>
  );
}
