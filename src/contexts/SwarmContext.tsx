import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import * as sdk from "matrix-js-sdk";
import type { Swarm, SwarmAccount, SwarmConfig, AppConfig } from "../lib/types";
import { DEFAULT_PREFERENCES } from "../lib/types";
import {
  loadAppConfig,
  saveAppConfig,
  clearAppConfig,
  generateId,
  getStorageKind,
  getEncryptedEnvelope,
  unlockMasterPassword,
  initStorageState,
  isAppConfigEncrypted,
} from "../lib/session";
import {
  createSwarmLockVerifier,
  verifySwarmLockPassword,
  encryptSwarmCredentials,
  decryptSwarmCredentials,
} from "../lib/swarmCrypto";
import { SwarmSyncScheduler } from "../lib/swarmSyncScheduler";

type ClientHealth = "healthy" | "syncing" | "error";

interface SwarmContextValue {
  swarms: Swarm[];
  activeSwarmId: string | null;
  clients: Map<string, sdk.MatrixClient>;
  clientHealth: Map<string, ClientHealth>;
  unlockedSwarms: Set<string>;

  addSwarm: (name: string) => Swarm;
  removeSwarm: (swarmId: string) => void;
  renameSwarm: (swarmId: string, name: string) => void;
  setActiveSwarm: (swarmId: string) => void;

  setSwarmPassword: (
    swarmId: string,
    password: string,
    hint?: string,
  ) => Promise<void>;
  clearSwarmPassword: (swarmId: string) => void;
  unlockSwarm: (swarmId: string, password: string) => Promise<boolean>;
  lockSwarm: (swarmId: string) => void;
  isSwarmUnlocked: (swarmId: string) => boolean;

  addAccount: (
    swarmId: string,
    baseUrl: string,
    user: string,
    password: string,
  ) => Promise<void>;
  removeAccount: (swarmId: string, accountId: string) => void;

  getHealthyClients: (swarmId?: string) => sdk.MatrixClient[];
  getPrimaryClient: () => sdk.MatrixClient | null;
  getAllSwarmClients: () => sdk.MatrixClient[];

  hasAnyAccounts: boolean;
  roomListVersion: number;
  bumpRoomList: () => void;

  recoveryKeyBytes: Uint8Array<ArrayBuffer> | null;
  setRecoveryKeyBytes: (bytes: Uint8Array<ArrayBuffer> | null) => void;
  addRecoveryKeyForSwarm: (
    swarmId: string,
    keyBytes: Uint8Array<ArrayBuffer>,
  ) => void;
  getRecoveryKeysForSwarm: (swarmId: string) => Uint8Array<ArrayBuffer>[];

  configNeedsUnlock: boolean;
  masterPasswordHint: string | undefined;
  unlockMasterConfig: (password: string) => Promise<boolean>;
}

const SwarmContext = createContext<SwarmContextValue | null>(null);

export function useSwarm(): SwarmContextValue {
  const ctx = useContext(SwarmContext);
  if (!ctx) throw new Error("useSwarm must be used within SwarmProvider");
  return ctx;
}

export function SwarmProvider({ children }: { children: ReactNode }) {
  const [swarms, setSwarms] = useState<Swarm[]>([]);
  const [activeSwarmId, setActiveSwarmId] = useState<string | null>(null);
  const [clients, setClients] = useState<Map<string, sdk.MatrixClient>>(
    () => new Map(),
  );
  const [clientHealth, setClientHealth] = useState<Map<string, ClientHealth>>(
    () => new Map(),
  );
  const [unlockedSwarms, setUnlockedSwarms] = useState<Set<string>>(
    () => new Set(),
  );
  const [roomListVersion, setRoomListVersion] = useState(0);
  const [hasAnyAccounts, setHasAnyAccounts] = useState(false);
  const [configNeedsUnlock, setConfigNeedsUnlock] = useState(false);
  const [masterPasswordHint, setMasterPasswordHint] = useState<
    string | undefined
  >(undefined);

  const [recoveryKeyBytes, setRecoveryKeyBytesState] =
    useState<Uint8Array<ArrayBuffer> | null>(null);
  const recoveryKeyBytesRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const setRecoveryKeyBytes = useCallback(
    (bytes: Uint8Array<ArrayBuffer> | null) => {
      recoveryKeyBytesRef.current = bytes;
      setRecoveryKeyBytesState(bytes);
    },
    [],
  );

  const swarmRecoveryKeysRef = useRef<Map<string, Uint8Array<ArrayBuffer>[]>>(
    new Map(),
  );

  const base64ToBytes = useCallback(
    (b64: string): Uint8Array<ArrayBuffer> => {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length) as Uint8Array<ArrayBuffer>;
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    },
    [],
  );

  const bytesToBase64 = useCallback(
    (bytes: Uint8Array<ArrayBuffer>): string => {
      let binary = "";
      for (let i = 0; i < bytes.length; i++)
        binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    },
    [],
  );

  const restoreSwarmRecoveryKeys = useCallback(
    (swarmId: string, keysBase64: string[] | undefined) => {
      if (!keysBase64 || keysBase64.length === 0) return;
      const decoded = keysBase64.map(base64ToBytes);
      swarmRecoveryKeysRef.current.set(swarmId, decoded);
      if (decoded.length > 0) {
        recoveryKeyBytesRef.current = decoded[0];
        setRecoveryKeyBytesState(decoded[0]);
      }
    },
    [base64ToBytes],
  );

  const addRecoveryKeyForSwarm = useCallback(
    (swarmId: string, keyBytes: Uint8Array<ArrayBuffer>) => {
      const existing = swarmRecoveryKeysRef.current.get(swarmId) ?? [];
      const b64 = bytesToBase64(keyBytes);
      const alreadyExists = existing.some(
        (k) => bytesToBase64(k) === b64,
      );
      if (alreadyExists) return;

      const updated = [...existing, keyBytes];
      swarmRecoveryKeysRef.current.set(swarmId, updated);

      const updatedSwarms = swarmsRef.current.map((s) =>
        s.id === swarmId
          ? { ...s, recoveryKeysBase64: updated.map(bytesToBase64) }
          : s,
      );
      setSwarms(updatedSwarms);
      const cfg = loadAppConfig();
      const config: AppConfig = {
        swarmConfig: {
          swarms: updatedSwarms,
          activeSwarmId:
            cfg?.swarmConfig.activeSwarmId ?? updatedSwarms[0]?.id ?? "",
        },
        preferences: cfg?.preferences ?? { ...DEFAULT_PREFERENCES },
      };
      saveAppConfig(config);
    },
    [bytesToBase64],
  );

  const getRecoveryKeysForSwarm = useCallback(
    (swarmId: string): Uint8Array<ArrayBuffer>[] => {
      return swarmRecoveryKeysRef.current.get(swarmId) ?? [];
    },
    [],
  );

  const clientsRef = useRef(clients);
  clientsRef.current = clients;
  const swarmsRef = useRef(swarms);
  swarmsRef.current = swarms;
  const schedulerRef = useRef<SwarmSyncScheduler | null>(null);
  const sessionVisitedRoomsRef = useRef<Set<string>>(new Set());
  const initedRef = useRef(false);

  const bumpRoomList = useCallback(
    () => setRoomListVersion((v) => v + 1),
    [],
  );

  const persist = useCallback(
    (updatedSwarms: Swarm[], activeId: string | null) => {
      const existing = loadAppConfig();
      const config: AppConfig = {
        swarmConfig: {
          swarms: updatedSwarms,
          activeSwarmId: activeId ?? updatedSwarms[0]?.id ?? "",
        },
        preferences: existing?.preferences ?? { ...DEFAULT_PREFERENCES },
      };
      saveAppConfig(config);
    },
    [],
  );

  const initClientForAccount = useCallback(
    async (account: SwarmAccount, isPrimary: boolean, swarmId?: string) => {
      if (clientsRef.current.has(account.id)) return;

      const ownerSwarmId = swarmId;
      const c = sdk.createClient({
        baseUrl: account.baseUrl,
        userId: account.userId,
        accessToken: account.accessToken,
        deviceId: account.deviceId,
        timelineSupport: true,
        cryptoCallbacks: {
          getSecretStorageKey: async ({ keys }) => {
            const swarmKeys = ownerSwarmId
              ? swarmRecoveryKeysRef.current.get(ownerSwarmId)
              : null;
            const rkb =
              swarmKeys && swarmKeys.length > 0
                ? swarmKeys[0]
                : recoveryKeyBytesRef.current;
            if (rkb) {
              const keyId = Object.keys(keys)[0];
              return [keyId, rkb] as [string, Uint8Array<ArrayBuffer>];
            }
            return null;
          },
          cacheSecretStorageKey: (
            _keyId: string,
            _keyInfo: unknown,
            key: Uint8Array<ArrayBuffer>,
          ) => {
            setRecoveryKeyBytes(key);
            if (ownerSwarmId) {
              addRecoveryKeyForSwarm(ownerSwarmId, key);
            }
          },
        },
      });

      try {
        await c.initRustCrypto({
          cryptoDatabasePrefix: `matrix-js-sdk-${account.userId}-${account.deviceId}`,
        });
      } catch (err) {
        console.warn("Crypto init failed for", account.userId, err);
      }

      c.on(sdk.ClientEvent.Sync, (state: string) => {
        setClientHealth((prev) => {
          const next = new Map(prev);
          if (state === "PREPARED" || state === "SYNCING")
            next.set(account.id, "healthy");
          else if (state === "ERROR") next.set(account.id, "error");
          else next.set(account.id, "syncing");
          return next;
        });
        if (state === "PREPARED" || state === "SYNCING") bumpRoomList();
      });

      c.on(sdk.RoomEvent.Timeline, () => bumpRoomList());
      c.on(sdk.RoomEvent.Name, () => bumpRoomList());
      c.on(sdk.RoomEvent.Receipt, () => bumpRoomList());
      c.on(sdk.RoomEvent.MyMembership, () => bumpRoomList());

      setClients((prev) => {
        const next = new Map(prev);
        next.set(account.id, c);
        return next;
      });

      if (isPrimary) {
        await c.startClient({ initialSyncLimit: 30 });
      } else {
        if (!schedulerRef.current) {
          const config = loadAppConfig();
          const prefs = config?.preferences ?? DEFAULT_PREFERENCES;
          schedulerRef.current = new SwarmSyncScheduler(
            prefs.swarmSecondarySyncIntervalMinutes,
            prefs.swarmMissedEventsThreshold,
            () => sessionVisitedRoomsRef.current,
          );
        }
        schedulerRef.current.addSecondaryClient(account.id, c);
      }
    },
    [bumpRoomList, addRecoveryKeyForSwarm],
  );

  const initFromConfig = useCallback(
    (config: AppConfig) => {
      const { swarms: loadedSwarms, activeSwarmId: loadedActiveId } =
        config.swarmConfig;
      setSwarms(loadedSwarms);

      const totalAccounts = loadedSwarms.reduce(
        (n, s) => n + s.accounts.length,
        0,
      );
      setHasAnyAccounts(totalAccounts > 0);

      const unlocked = new Set<string>();
      for (const swarm of loadedSwarms) {
        if (!swarm.lockSalt) {
          unlocked.add(swarm.id);
        }
      }
      setUnlockedSwarms(unlocked);

      const safeActiveId = unlocked.has(loadedActiveId)
        ? loadedActiveId
        : loadedSwarms.find((s) => unlocked.has(s.id))?.id ?? null;
      setActiveSwarmId(safeActiveId);

      for (const sw of loadedSwarms) {
        restoreSwarmRecoveryKeys(sw.id, sw.recoveryKeysBase64);
      }

      (async () => {
        for (const sw of loadedSwarms) {
          if (!unlocked.has(sw.id)) continue;
          for (let i = 0; i < sw.accounts.length; i++) {
            const isPrimary = i === 0;
            try {
              await initClientForAccount(sw.accounts[i], isPrimary, sw.id);
            } catch (err) {
              console.error(
                "Failed to init client for",
                sw.accounts[i].userId,
                err,
              );
            }
          }
        }
      })();
    },
    [initClientForAccount, restoreSwarmRecoveryKeys],
  );

  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;

    initStorageState();
    const kind = getStorageKind();

    if (kind === "encrypted") {
      const envelope = getEncryptedEnvelope();
      setConfigNeedsUnlock(true);
      setMasterPasswordHint(envelope?.masterPasswordHint);
      setHasAnyAccounts(
        (envelope?.swarms?.length ?? 0) > 0,
      );
      return;
    }

    const config = loadAppConfig();
    if (!config) return;

    initFromConfig(config);
  }, [initFromConfig]);

  const unlockMasterConfigCb = useCallback(
    async (password: string): Promise<boolean> => {
      const ok = await unlockMasterPassword(password);
      if (!ok) return false;

      const config = loadAppConfig();
      if (!config) return false;

      setConfigNeedsUnlock(false);
      initFromConfig(config);
      return true;
    },
    [initFromConfig],
  );

  const addSwarm = useCallback(
    (name: string): Swarm => {
      const swarm: Swarm = { id: generateId(), name, accounts: [] };
      const updated = [...swarmsRef.current, swarm];
      setSwarms(updated);
      const activeId = activeSwarmId ?? swarm.id;
      if (!activeSwarmId) setActiveSwarmId(swarm.id);
      persist(updated, activeId);
      setUnlockedSwarms((prev) => new Set(prev).add(swarm.id));
      return swarm;
    },
    [activeSwarmId, persist],
  );

  const removeSwarm = useCallback(
    (swarmId: string) => {
      const swarm = swarmsRef.current.find((s) => s.id === swarmId);
      if (swarm) {
        for (const acc of swarm.accounts) {
          const c = clientsRef.current.get(acc.id);
          if (c) {
            c.stopClient();
            c.logout(true).catch(() => {});
          }
          schedulerRef.current?.removeClient(acc.id);
          setClients((prev) => {
            const next = new Map(prev);
            next.delete(acc.id);
            return next;
          });
        }
      }
      const updated = swarmsRef.current.filter((s) => s.id !== swarmId);
      setSwarms(updated);
      const newActive =
        activeSwarmId === swarmId
          ? updated[0]?.id ?? null
          : activeSwarmId;
      setActiveSwarmId(newActive);
      persist(updated, newActive);
      bumpRoomList();
    },
    [activeSwarmId, persist, bumpRoomList],
  );

  const renameSwarm = useCallback(
    (swarmId: string, name: string) => {
      const updated = swarmsRef.current.map((s) =>
        s.id === swarmId ? { ...s, name } : s,
      );
      setSwarms(updated);
      persist(updated, activeSwarmId);
    },
    [activeSwarmId, persist],
  );

  const setActiveSwarmCb = useCallback(
    (swarmId: string) => {
      if (!unlockedSwarms.has(swarmId)) return;
      setActiveSwarmId(swarmId);
      persist(swarmsRef.current, swarmId);
      bumpRoomList();
    },
    [persist, bumpRoomList, unlockedSwarms],
  );

  const setSwarmPasswordCb = useCallback(
    async (swarmId: string, password: string, hint?: string) => {
      const { lockSalt, lockVerifier } =
        await createSwarmLockVerifier(password);
      const swarm = swarmsRef.current.find((s) => s.id === swarmId);
      if (!swarm) return;

      const accountsWithoutPasswords = swarm.accounts.map(
        ({ password: _, ...rest }) => rest,
      );
      const credsJson = JSON.stringify({
        accounts: accountsWithoutPasswords,
        recoveryKeysBase64: swarm.recoveryKeysBase64,
      });
      const encrypted = await encryptSwarmCredentials(credsJson, password);

      const updated = swarmsRef.current.map((s) =>
        s.id === swarmId
          ? {
              ...s,
              lockSalt,
              lockVerifier,
              passwordHint: hint,
              encryptedCredentials: encrypted,
            }
          : s,
      );
      setSwarms(updated);
      persist(updated, activeSwarmId);
    },
    [activeSwarmId, persist],
  );

  const clearSwarmPasswordCb = useCallback(
    (swarmId: string) => {
      const updated = swarmsRef.current.map((s) =>
        s.id === swarmId
          ? {
              ...s,
              lockSalt: undefined,
              lockVerifier: undefined,
              passwordHint: undefined,
              encryptedCredentials: undefined,
            }
          : s,
      );
      setSwarms(updated);
      setUnlockedSwarms((prev) => new Set(prev).add(swarmId));
      persist(updated, activeSwarmId);
    },
    [activeSwarmId, persist],
  );

  const unlockSwarmCb = useCallback(
    async (swarmId: string, password: string): Promise<boolean> => {
      const swarm = swarmsRef.current.find((s) => s.id === swarmId);
      if (!swarm || !swarm.lockSalt || !swarm.lockVerifier) return false;

      const ok = await verifySwarmLockPassword(
        password,
        swarm.lockSalt,
        swarm.lockVerifier,
      );
      if (!ok) return false;

      if (swarm.encryptedCredentials) {
        try {
          const json = await decryptSwarmCredentials(
            swarm.encryptedCredentials.salt,
            swarm.encryptedCredentials.iv,
            swarm.encryptedCredentials.ciphertext,
            password,
          );
          const parsed = JSON.parse(json);
          let accounts: SwarmAccount[];
          let recoveryKeysBase64: string[] | undefined;
          if (Array.isArray(parsed)) {
            accounts = parsed as SwarmAccount[];
          } else {
            accounts = parsed.accounts as SwarmAccount[];
            recoveryKeysBase64 = parsed.recoveryKeysBase64;
          }
          const updated = swarmsRef.current.map((s) =>
            s.id === swarmId
              ? { ...s, accounts, recoveryKeysBase64 }
              : s,
          );
          setSwarms(updated);
          persist(updated, activeSwarmId);

          restoreSwarmRecoveryKeys(swarmId, recoveryKeysBase64);

          for (let i = 0; i < accounts.length; i++) {
            try {
              await initClientForAccount(accounts[i], i === 0, swarmId);
            } catch (err) {
              console.error("Failed to init unlocked account", err);
            }
          }
        } catch (err) {
          console.error("Failed to decrypt swarm credentials", err);
          return false;
        }
      }

      setUnlockedSwarms((prev) => new Set(prev).add(swarmId));
      bumpRoomList();
      return true;
    },
    [
      activeSwarmId,
      persist,
      initClientForAccount,
      bumpRoomList,
      restoreSwarmRecoveryKeys,
    ],
  );

  const lockSwarmCb = useCallback(
    (swarmId: string) => {
      const swarm = swarmsRef.current.find((s) => s.id === swarmId);
      if (!swarm) return;

      for (const acc of swarm.accounts) {
        const c = clientsRef.current.get(acc.id);
        if (c) c.stopClient();
        schedulerRef.current?.removeClient(acc.id);
        setClients((prev) => {
          const next = new Map(prev);
          next.delete(acc.id);
          return next;
        });
        setClientHealth((prev) => {
          const next = new Map(prev);
          next.delete(acc.id);
          return next;
        });
      }

      const newUnlocked = new Set(unlockedSwarms);
      newUnlocked.delete(swarmId);
      setUnlockedSwarms(newUnlocked);

      const updated = swarmsRef.current.map((s) =>
        s.id === swarmId ? { ...s, accounts: [] } : s,
      );
      setSwarms(updated);

      let newActive = activeSwarmId;
      if (activeSwarmId === swarmId) {
        newActive =
          updated.find((s) => newUnlocked.has(s.id))?.id ?? null;
        setActiveSwarmId(newActive);
      }

      persist(updated, newActive);
      bumpRoomList();
    },
    [bumpRoomList, activeSwarmId, unlockedSwarms, persist],
  );

  const isSwarmUnlocked = useCallback(
    (swarmId: string) => unlockedSwarms.has(swarmId),
    [unlockedSwarms],
  );

  const addAccount = useCallback(
    async (
      swarmId: string,
      baseUrl: string,
      user: string,
      password: string,
    ) => {
      const trimmed = baseUrl.replace(/\/+$/, "");
      const tempClient = sdk.createClient({ baseUrl: trimmed });
      const resp = await tempClient.login("m.login.password", {
        user,
        password,
        initial_device_display_name: "Matrix Mini Client",
      });
      tempClient.stopClient();

      const cfg = loadAppConfig();
      const shouldStorePassword =
        isAppConfigEncrypted() &&
        cfg?.preferences.storeAccountPasswords === true;

      const account: SwarmAccount = {
        id: generateId(),
        baseUrl: trimmed,
        userId: resp.user_id,
        accessToken: resp.access_token,
        deviceId: resp.device_id,
        ...(shouldStorePassword ? { password } : {}),
      };

      const swarm = swarmsRef.current.find((s) => s.id === swarmId);
      const isPrimary = !swarm || swarm.accounts.length === 0;

      const updated = swarmsRef.current.map((s) =>
        s.id === swarmId
          ? { ...s, accounts: [...s.accounts, account] }
          : s,
      );
      setSwarms(updated);
      setHasAnyAccounts(true);
      persist(updated, activeSwarmId);

      await initClientForAccount(account, isPrimary, swarmId);
      bumpRoomList();
    },
    [activeSwarmId, persist, initClientForAccount, bumpRoomList],
  );

  const removeAccount = useCallback(
    (swarmId: string, accountId: string) => {
      const c = clientsRef.current.get(accountId);
      if (c) {
        c.stopClient();
        c.logout(true).catch(() => {});
      }
      schedulerRef.current?.removeClient(accountId);
      setClients((prev) => {
        const next = new Map(prev);
        next.delete(accountId);
        return next;
      });
      setClientHealth((prev) => {
        const next = new Map(prev);
        next.delete(accountId);
        return next;
      });

      const updated = swarmsRef.current.map((s) =>
        s.id === swarmId
          ? { ...s, accounts: s.accounts.filter((a) => a.id !== accountId) }
          : s,
      );
      setSwarms(updated);
      const totalAccounts = updated.reduce(
        (n, s) => n + s.accounts.length,
        0,
      );
      setHasAnyAccounts(totalAccounts > 0);
      persist(updated, activeSwarmId);
      bumpRoomList();
    },
    [activeSwarmId, persist, bumpRoomList],
  );

  const getHealthyClients = useCallback(
    (swarmId?: string): sdk.MatrixClient[] => {
      const targetId = swarmId ?? activeSwarmId;
      if (!targetId) return [];
      const swarm = swarmsRef.current.find((s) => s.id === targetId);
      if (!swarm || !unlockedSwarms.has(targetId)) return [];

      const result: sdk.MatrixClient[] = [];
      for (const acc of swarm.accounts) {
        const c = clientsRef.current.get(acc.id);
        const health = clientHealth.get(acc.id);
        if (c && health === "healthy") result.push(c);
      }
      return result;
    },
    [activeSwarmId, clientHealth, unlockedSwarms],
  );

  const getPrimaryClient = useCallback((): sdk.MatrixClient | null => {
    if (!activeSwarmId) return null;
    const swarm = swarmsRef.current.find((s) => s.id === activeSwarmId);
    if (!swarm || !unlockedSwarms.has(activeSwarmId)) return null;
    if (swarm.accounts.length === 0) return null;

    const primary = clientsRef.current.get(swarm.accounts[0].id);
    if (primary) return primary;

    for (const acc of swarm.accounts) {
      const c = clientsRef.current.get(acc.id);
      if (c && clientHealth.get(acc.id) === "healthy") return c;
    }
    return null;
  }, [activeSwarmId, clientHealth, unlockedSwarms]);

  const getAllSwarmClients = useCallback((): sdk.MatrixClient[] => {
    if (!activeSwarmId) return [];
    const swarm = swarmsRef.current.find((s) => s.id === activeSwarmId);
    if (!swarm || !unlockedSwarms.has(activeSwarmId)) return [];

    const result: sdk.MatrixClient[] = [];
    for (const acc of swarm.accounts) {
      const c = clientsRef.current.get(acc.id);
      if (c) result.push(c);
    }
    return result;
  }, [activeSwarmId, unlockedSwarms]);

  useEffect(() => {
    return () => {
      schedulerRef.current?.destroy();
    };
  }, []);

  return (
    <SwarmContext.Provider
      value={{
        swarms,
        activeSwarmId,
        clients,
        clientHealth,
        unlockedSwarms,
        addSwarm,
        removeSwarm,
        renameSwarm,
        setActiveSwarm: setActiveSwarmCb,
        setSwarmPassword: setSwarmPasswordCb,
        clearSwarmPassword: clearSwarmPasswordCb,
        unlockSwarm: unlockSwarmCb,
        lockSwarm: lockSwarmCb,
        isSwarmUnlocked,
        addAccount,
        removeAccount,
        getHealthyClients,
        getPrimaryClient,
        getAllSwarmClients,
        hasAnyAccounts,
        roomListVersion,
        bumpRoomList,
        recoveryKeyBytes,
        setRecoveryKeyBytes,
        addRecoveryKeyForSwarm,
        getRecoveryKeysForSwarm,
        configNeedsUnlock,
        masterPasswordHint,
        unlockMasterConfig: unlockMasterConfigCb,
      }}
    >
      {children}
    </SwarmContext.Provider>
  );
}
