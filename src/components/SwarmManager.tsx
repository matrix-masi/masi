import { useState, type FormEvent } from "react";
import { Trash2, Plus, Lock, Unlock, Download, Key } from "lucide-react";
import { useSwarm } from "../contexts/SwarmContext";
import { useSettings } from "../contexts/SettingsContext";
import { exportAppConfig, exportSwarmConfig } from "../lib/swarmCrypto";
import { loadAppConfig } from "../lib/session";
import type { Swarm } from "../lib/types";

const SWARM_COLORS = [
  "border-blue-500",
  "border-green-500",
  "border-purple-500",
  "border-pink-500",
  "border-cyan-500",
  "border-yellow-500",
];

const NAME_COLORS = [
  "bg-blue-700",
  "bg-green-700",
  "bg-purple-700",
  "bg-pink-700",
  "bg-cyan-700",
  "bg-yellow-700",
];

export default function SwarmManager() {
  const {
    swarms,
    activeSwarmId,
    setActiveSwarm,
    addSwarm,
    removeSwarm,
    renameSwarm,
    addAccount,
    removeAccount,
    setSwarmPassword,
    clearSwarmPassword,
    unlockSwarm,
    lockSwarm,
    isSwarmUnlocked,
  } = useSwarm();

  const {
    swarmFailoverTimeout,
    setSwarmFailoverTimeout,
    swarmSecondarySyncIntervalMinutes,
    setSwarmSecondarySyncIntervalMinutes,
    swarmMissedEventsThreshold,
    setSwarmMissedEventsThreshold,
  } = useSettings();

  return (
    <div className="space-y-4">
      <h3 className="text-[0.85rem] font-semibold uppercase tracking-wide text-muted">
        Swarms
      </h3>

      {swarms.map((swarm, idx) => (
        <SwarmCard
          key={swarm.id}
          swarm={swarm}
          colorIdx={idx}
          isActive={swarm.id === activeSwarmId}
          unlocked={isSwarmUnlocked(swarm.id)}
          onSetActive={() => setActiveSwarm(swarm.id)}
          onRename={(name) => renameSwarm(swarm.id, name)}
          onDelete={() => {
            if (confirm(`Delete swarm "${swarm.name}" and all its accounts?`))
              removeSwarm(swarm.id);
          }}
          onAddAccount={(baseUrl, user, pw) =>
            addAccount(swarm.id, baseUrl, user, pw)
          }
          onRemoveAccount={(accId) => removeAccount(swarm.id, accId)}
          onSetPassword={(pw, hint) => setSwarmPassword(swarm.id, pw, hint)}
          onClearPassword={() => clearSwarmPassword(swarm.id)}
          onUnlock={(pw) => unlockSwarm(swarm.id, pw)}
          onLock={() => lockSwarm(swarm.id)}
        />
      ))}

      <button
        type="button"
        onClick={() => addSwarm("New Swarm")}
        className="mx-auto flex items-center gap-2 rounded-sm bg-purple-700 px-5 py-2 text-[0.85rem] font-semibold text-white transition-colors hover:bg-purple-600"
      >
        <Plus size={16} />
        Add Swarm
      </button>

      <div className="mt-6 space-y-3">
        <h3 className="text-[0.85rem] font-semibold uppercase tracking-wide text-muted">
          Swarm Settings
        </h3>

        <div className="flex items-center justify-between rounded-lg bg-surface2 px-4 py-3">
          <div>
            <span className="text-[0.9rem]">Failover timeout</span>
            <p className="text-[0.75rem] text-muted">
              Seconds before trying the next account when sending fails
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              max={30}
              value={swarmFailoverTimeout}
              onChange={(e) => setSwarmFailoverTimeout(Number(e.target.value))}
              className="w-16 rounded-sm border border-border bg-background px-2 py-1 text-center text-[0.85rem] text-foreground outline-none focus:border-accent"
            />
            <span className="text-[0.8rem] text-muted">s</span>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-surface2 px-4 py-3">
          <div>
            <span className="text-[0.9rem]">Secondary sync interval</span>
            <p className="text-[0.75rem] text-muted">
              Minutes between syncs for non-primary accounts
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              max={5}
              value={swarmSecondarySyncIntervalMinutes}
              onChange={(e) =>
                setSwarmSecondarySyncIntervalMinutes(Number(e.target.value))
              }
              className="w-16 rounded-sm border border-border bg-background px-2 py-1 text-center text-[0.85rem] text-foreground outline-none focus:border-accent"
            />
            <span className="text-[0.8rem] text-muted">min</span>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-surface2 px-4 py-3">
          <div>
            <span className="text-[0.9rem]">Missed events threshold</span>
            <p className="text-[0.75rem] text-muted">
              Missed events in visited rooms before switching to frequent sync
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              max={50}
              value={swarmMissedEventsThreshold}
              onChange={(e) =>
                setSwarmMissedEventsThreshold(Number(e.target.value))
              }
              className="w-16 rounded-sm border border-border bg-background px-2 py-1 text-center text-[0.85rem] text-foreground outline-none focus:border-accent"
            />
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <h3 className="text-[0.85rem] font-semibold uppercase tracking-wide text-muted">
          Export
        </h3>
        <div className="flex gap-2">
          <ExportButton
            label="Export All Config"
            payloadType="appConfig"
          />
          <ExportButton
            label="Export Swarms Only"
            payloadType="swarmConfig"
          />
        </div>
      </div>
    </div>
  );
}

function ExportButton({
  label,
  payloadType,
}: {
  label: string;
  payloadType: "appConfig" | "swarmConfig";
}) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    const pw = prompt("Enter master password to encrypt export:");
    if (!pw) return;

    setExporting(true);
    try {
      const config = loadAppConfig();
      if (!config) {
        alert("No configuration to export.");
        return;
      }

      let blob: Blob;
      if (payloadType === "appConfig") {
        const payload = await exportAppConfig(
          {
            swarmConfig: config.swarmConfig,
            preferences: config.preferences,
          },
          pw,
        );
        blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        });
      } else {
        const payload = await exportSwarmConfig(config.swarmConfig, pw);
        blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        });
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `matrix-${payloadType}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed: " + (err instanceof Error ? err.message : err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={exporting}
      className="flex items-center gap-1.5 rounded-sm bg-accent px-3 py-1.5 text-[0.82rem] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
    >
      <Download size={14} />
      {exporting ? "Exporting…" : label}
    </button>
  );
}

interface SwarmCardProps {
  swarm: Swarm;
  colorIdx: number;
  isActive: boolean;
  unlocked: boolean;
  onSetActive: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onAddAccount: (baseUrl: string, user: string, pw: string) => Promise<void>;
  onRemoveAccount: (accountId: string) => void;
  onSetPassword: (pw: string, hint?: string) => Promise<void>;
  onClearPassword: () => void;
  onUnlock: (pw: string) => Promise<boolean>;
  onLock: () => void;
}

function SwarmCard({
  swarm,
  colorIdx,
  isActive,
  unlocked,
  onSetActive,
  onRename,
  onDelete,
  onAddAccount,
  onRemoveAccount,
  onSetPassword,
  onClearPassword,
  onUnlock,
  onLock,
}: SwarmCardProps) {
  const borderColor = SWARM_COLORS[colorIdx % SWARM_COLORS.length];
  const nameColor = NAME_COLORS[colorIdx % NAME_COLORS.length];
  const [showAddForm, setShowAddForm] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [unlockInput, setUnlockInput] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(swarm.name);

  const hasLock = !!swarm.lockSalt;

  const handleUnlock = async () => {
    setUnlockError(null);
    const ok = await onUnlock(unlockInput);
    if (ok) {
      setUnlockInput("");
    } else {
      setUnlockError("Incorrect password");
    }
  };

  return (
    <div className={`rounded-lg border-2 ${borderColor} bg-surface2 p-3`}>
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onSetActive}
          className={`h-5 w-5 shrink-0 rounded-full border-2 transition-colors ${
            isActive
              ? "border-accent bg-accent"
              : "border-muted hover:border-foreground"
          }`}
          title="Set as active swarm"
        />

        {editing ? (
          <input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={() => {
              onRename(editName.trim() || swarm.name);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onRename(editName.trim() || swarm.name);
                setEditing(false);
              }
            }}
            className="rounded px-2 py-0.5 text-[0.9rem] font-semibold text-white bg-transparent border border-border outline-none focus:border-accent"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditName(swarm.name);
              setEditing(true);
            }}
            className={`rounded px-2 py-0.5 text-[0.9rem] font-semibold text-white ${nameColor}`}
          >
            {swarm.name}
          </button>
        )}

        <div className="flex-1" />

        {hasLock && unlocked && (
          <button
            type="button"
            onClick={onLock}
            title="Lock swarm"
            className="rounded p-1 text-muted transition-colors hover:text-foreground"
          >
            <Lock size={15} />
          </button>
        )}
        {hasLock && !unlocked && (
          <Lock size={15} className="text-yellow-500" />
        )}

        <button
          type="button"
          onClick={onDelete}
          title="Delete swarm"
          className="rounded p-1 text-muted transition-colors hover:text-danger"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {!unlocked && hasLock ? (
        <div className="space-y-2 py-2">
          <p className="text-[0.82rem] text-muted">
            This swarm is locked.
            {swarm.passwordHint && (
              <span className="ml-1 italic">Hint: {swarm.passwordHint}</span>
            )}
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="Swarm password"
              value={unlockInput}
              onChange={(e) => setUnlockInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
              className="min-w-0 flex-1 rounded-sm border border-border bg-background px-2 py-1.5 text-[0.85rem] text-foreground outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={handleUnlock}
              className="flex items-center gap-1 rounded-sm bg-accent px-3 py-1.5 text-[0.82rem] font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              <Unlock size={13} />
              Unlock
            </button>
          </div>
          {unlockError && (
            <p className="text-[0.78rem] text-danger">{unlockError}</p>
          )}
        </div>
      ) : (
        <>
          {swarm.accounts.length > 0 && (
            <table className="mb-2 w-full text-[0.82rem]">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="py-1 text-left font-semibold">User</th>
                  <th className="py-1 text-left font-semibold">Server</th>
                  <th className="py-1 text-left font-semibold">Pass</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {swarm.accounts.map((acc) => {
                  const server = new URL(acc.baseUrl).hostname;
                  return (
                    <tr key={acc.id} className="border-b border-border/50">
                      <td className="py-1.5">{acc.userId.split(":")[0].replace("@", "")}</td>
                      <td className="py-1.5">{server}</td>
                      <td className="py-1.5 text-muted">••••••••••••</td>
                      <td className="py-1.5">
                        <button
                          type="button"
                          onClick={() => onRemoveAccount(acc.id)}
                          title="Remove account"
                          className="rounded p-0.5 text-muted transition-colors hover:text-danger"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {showAddForm ? (
            <AddAccountForm
              onSubmit={async (baseUrl, user, pw) => {
                await onAddAccount(baseUrl, user, pw);
                setShowAddForm(false);
              }}
              onCancel={() => setShowAddForm(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="mx-auto flex items-center gap-1.5 rounded-sm bg-green-700 px-4 py-1.5 text-[0.82rem] font-semibold text-white transition-colors hover:bg-green-600"
            >
              <Plus size={14} />
              Add Account
            </button>
          )}

          <div className="mt-2 flex items-center gap-2">
            {showPasswordForm ? (
              <SetPasswordForm
                hasPassword={hasLock}
                onSubmit={async (pw, hint) => {
                  await onSetPassword(pw, hint);
                  setShowPasswordForm(false);
                }}
                onClear={() => {
                  onClearPassword();
                  setShowPasswordForm(false);
                }}
                onCancel={() => setShowPasswordForm(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowPasswordForm(true)}
                className="flex items-center gap-1 text-[0.78rem] text-muted transition-colors hover:text-foreground"
              >
                <Key size={12} />
                {hasLock ? "Change swarm password" : "Set swarm password"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AddAccountForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (baseUrl: string, user: string, pw: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [baseUrl, setBaseUrl] = useState("https://matrix.org");
  const [user, setUser] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onSubmit(baseUrl, user, pw);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mb-2 space-y-2 rounded border border-border bg-background p-2">
      <input
        type="url"
        placeholder="Server URL"
        value={baseUrl}
        onChange={(e) => setBaseUrl(e.target.value)}
        required
        className="w-full rounded-sm border border-border bg-surface px-2 py-1.5 text-[0.82rem] text-foreground outline-none focus:border-accent"
      />
      <input
        type="text"
        placeholder="Username"
        value={user}
        onChange={(e) => setUser(e.target.value)}
        required
        className="w-full rounded-sm border border-border bg-surface px-2 py-1.5 text-[0.82rem] text-foreground outline-none focus:border-accent"
      />
      <input
        type="password"
        placeholder="Password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        required
        className="w-full rounded-sm border border-border bg-surface px-2 py-1.5 text-[0.82rem] text-foreground outline-none focus:border-accent"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-sm bg-green-700 px-3 py-1 text-[0.82rem] font-semibold text-white transition-colors hover:bg-green-600 disabled:opacity-50"
        >
          {loading ? "Logging in…" : "Login"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-sm px-3 py-1 text-[0.82rem] text-muted transition-colors hover:text-foreground"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-[0.78rem] text-danger">{error}</p>}
    </form>
  );
}

function SetPasswordForm({
  hasPassword,
  onSubmit,
  onClear,
  onCancel,
}: {
  hasPassword: boolean;
  onSubmit: (pw: string, hint?: string) => Promise<void>;
  onClear: () => void;
  onCancel: () => void;
}) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [hint, setHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit(pw, hint || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex-1 space-y-2 rounded border border-border bg-background p-2"
    >
      <input
        type="password"
        placeholder="New password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        required
        className="w-full rounded-sm border border-border bg-surface px-2 py-1.5 text-[0.82rem] text-foreground outline-none focus:border-accent"
      />
      <input
        type="password"
        placeholder="Confirm password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
        className="w-full rounded-sm border border-border bg-surface px-2 py-1.5 text-[0.82rem] text-foreground outline-none focus:border-accent"
      />
      <input
        type="text"
        placeholder="Password hint (optional)"
        value={hint}
        onChange={(e) => setHint(e.target.value)}
        className="w-full rounded-sm border border-border bg-surface px-2 py-1.5 text-[0.82rem] text-foreground outline-none focus:border-accent"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-sm bg-accent px-3 py-1 text-[0.82rem] font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? "Setting…" : "Set Password"}
        </button>
        {hasPassword && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-sm px-3 py-1 text-[0.82rem] text-danger hover:underline"
          >
            Remove
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="rounded-sm px-3 py-1 text-[0.82rem] text-muted hover:text-foreground"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-[0.78rem] text-danger">{error}</p>}
    </form>
  );
}
