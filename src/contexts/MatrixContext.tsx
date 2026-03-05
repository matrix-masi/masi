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
import type { Swarm } from "../lib/types";
import { clearBlobCache } from "../lib/media";
import { clearAppConfig, generateId } from "../lib/session";
import { useSwarm } from "./SwarmContext";

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
  login: (baseUrl: string, user: string, password: string) => Promise<void>;
  logout: () => void;

  activeSwarm: Swarm | null;
  allSwarmClients: sdk.MatrixClient[];
  isActiveSwarmUnlocked: boolean;
  sendingSwarmId: string | null;
  setSendingSwarmId: (id: string | null) => void;
  sessionVisitedRoomIds: Set<string>;

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

  targetEventId: string | null;
  setTargetEventId: (id: string | null) => void;
  navigateToEvent: (roomId: string, eventId: string) => void;

  playlistTarget: { roomId: string } | null;
  openPlaylist: (roomId: string) => void;
  closePlaylist: () => void;
}

const MatrixContext = createContext<MatrixContextValue | null>(null);

export function useMatrix(): MatrixContextValue {
  const ctx = useContext(MatrixContext);
  if (!ctx) throw new Error("useMatrix must be used within MatrixProvider");
  return ctx;
}

export function MatrixProvider({ children }: { children: ReactNode }) {
  const swarm = useSwarm();

  const [currentRoomId, setCurrentRoomIdRaw] = useState<string | null>(null);
  const [lightboxTarget, setLightboxTarget] = useState<LightboxTarget | null>(null);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [showCryptoBanner, setShowCryptoBanner] = useState(false);
  const [targetEventId, setTargetEventId] = useState<string | null>(null);
  const [playlistTarget, setPlaylistTarget] = useState<{ roomId: string } | null>(null);
  const [sendingSwarmId, setSendingSwarmId] = useState<string | null>(null);

  const sessionVisitedRoomIdsRef = useRef<Set<string>>(new Set());
  const [sessionVisitedRoomIds] = useState(() => sessionVisitedRoomIdsRef.current);

  const recoveryResolveRef = useRef<
    ((decoded: Uint8Array<ArrayBuffer> | null) => void) | null
  >(null);

  const client = swarm.getPrimaryClient();
  const allSwarmClients = swarm.getAllSwarmClients();

  const activeSwarm =
    swarm.swarms.find((s) => s.id === swarm.activeSwarmId) ?? null;
  const isActiveSwarmUnlocked = activeSwarm
    ? swarm.isSwarmUnlocked(activeSwarm.id)
    : false;

  const syncState = (() => {
    if (!client) return null;
    if (!activeSwarm) return null;
    const firstAcc = activeSwarm.accounts[0];
    if (!firstAcc) return null;
    const health = swarm.clientHealth.get(firstAcc.id);
    if (health === "healthy") return "SYNCING";
    if (health === "error") return "ERROR";
    return "SYNCING";
  })();

  const setCurrentRoomId = useCallback(
    (id: string | null) => {
      setCurrentRoomIdRaw(id);
      if (id) sessionVisitedRoomIdsRef.current.add(id);
    },
    [],
  );

  const login = useCallback(
    async (baseUrl: string, user: string, password: string) => {
      let targetSwarmId = swarm.activeSwarmId;
      if (!targetSwarmId || swarm.swarms.length === 0) {
        const newSwarm = swarm.addSwarm("My Swarm");
        targetSwarmId = newSwarm.id;
      }
      await swarm.addAccount(targetSwarmId!, baseUrl, user, password);
    },
    [swarm],
  );

  const logout = useCallback(() => {
    if (!confirm("Sign out of all accounts?")) return;
    clearBlobCache();
    for (const [, c] of swarm.clients) {
      try {
        c.stopClient();
        c.logout(true).catch(() => {});
      } catch {}
    }
    clearAppConfig();
    location.reload();
  }, [swarm]);

  const navigateToEvent = useCallback(
    (roomId: string, eventId: string) => {
      setTargetEventId(eventId);
      setCurrentRoomId(roomId);
    },
    [setCurrentRoomId],
  );

  const openLightbox = useCallback(
    (type: "image" | "video", content: Record<string, unknown>) => {
      setLightboxTarget({ type, content });
    },
    [],
  );
  const closeLightbox = useCallback(() => setLightboxTarget(null), []);

  const openPlaylist = useCallback((roomId: string) => {
    setPlaylistTarget({ roomId });
  }, []);
  const closePlaylist = useCallback(() => setPlaylistTarget(null), []);

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

      swarm.setRecoveryKeyBytes(decoded);

      if (recoveryResolveRef.current) {
        recoveryResolveRef.current(decoded);
        recoveryResolveRef.current = null;
        setShowRecoveryModal(false);
        setRecoveryError(null);
        return;
      }

      setRecoveryLoading(true);
      setRecoveryError(null);

      const targets = allSwarmClients.length > 0 ? allSwarmClients : client ? [client] : [];
      for (const c of targets) {
        try {
          let cryptoModule = c.getCrypto();
          if (!cryptoModule) {
            const userId = c.getUserId();
            const deviceId = c.getDeviceId();
            await c.initRustCrypto({
              cryptoDatabasePrefix:
                userId && deviceId
                  ? `matrix-js-sdk-${userId}-${deviceId}`
                  : undefined,
            });
            cryptoModule = c.getCrypto();
          }
          if (cryptoModule) {
            await cryptoModule.loadSessionBackupPrivateKeyFromSecretStorage();
            await cryptoModule.checkKeyBackupAndEnable();
          }
        } catch (err) {
          console.warn("Recovery key setup failed for client:", err);
        }
      }

      setShowRecoveryModal(false);
      setShowCryptoBanner(false);
      setRecoveryLoading(false);
    },
    [swarm, allSwarmClients, client],
  );

  return (
    <MatrixContext.Provider
      value={{
        client,
        currentRoomId,
        setCurrentRoomId,
        cryptoAvailable: true,
        syncState,
        roomListVersion: swarm.roomListVersion,
        login,
        logout,
        activeSwarm,
        allSwarmClients,
        isActiveSwarmUnlocked,
        sendingSwarmId,
        setSendingSwarmId,
        sessionVisitedRoomIds,
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
        targetEventId,
        setTargetEventId,
        navigateToEvent,
        playlistTarget,
        openPlaylist,
        closePlaylist,
      }}
    >
      {children}
    </MatrixContext.Provider>
  );
}
