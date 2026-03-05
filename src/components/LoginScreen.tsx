import { useState, useRef, type FormEvent } from "react";
import { Upload } from "lucide-react";
import { useMatrix } from "../contexts/MatrixContext";
import { useSwarm } from "../contexts/SwarmContext";
import {
  importAppConfig,
  importSwarmConfig,
} from "../lib/swarmCrypto";
import { saveAppConfig } from "../lib/session";
import type { EncryptedPayload, AppConfig } from "../lib/types";
import { DEFAULT_PREFERENCES } from "../lib/types";

export default function LoginScreen() {
  const { login } = useMatrix();
  const swarmCtx = useSwarm();
  const [serverUrl, setServerUrl] = useState("https://matrix.org");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(serverUrl, username, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  };

  const handleImport = async (file: File) => {
    const masterPw = prompt("Enter master password to decrypt:");
    if (!masterPw) return;

    setImportLoading(true);
    setError(null);

    try {
      const text = await file.text();
      const blob = JSON.parse(text) as EncryptedPayload;

      if (blob.payloadType === "appConfig") {
        const data = await importAppConfig(blob, masterPw);
        const config: AppConfig = {
          swarmConfig: data.swarmConfig,
          preferences: data.preferences ?? { ...DEFAULT_PREFERENCES },
        };
        saveAppConfig(config);
        location.reload();
      } else if (blob.payloadType === "swarmConfig") {
        const swarmConfig = await importSwarmConfig(blob, masterPw);
        const config: AppConfig = {
          swarmConfig,
          preferences: { ...DEFAULT_PREFERENCES },
        };
        saveAppConfig(config);
        location.reload();
      } else {
        setError("Unknown config format.");
      }
    } catch (err) {
      setError(
        "Import failed: " + (err instanceof Error ? err.message : "Invalid password or corrupt file"),
      );
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-[340px] max-w-[92vw] rounded-[14px] bg-surface p-8 text-center">
        <h1 className="text-[1.8rem] font-bold tracking-tight">Matrix</h1>
        <p className="mb-6 text-[0.85rem] text-muted">Minimalist client</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="url"
            placeholder="Server URL"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            required
            className="w-full rounded-sm border border-border bg-background px-3.5 py-2.5 text-[0.9rem] text-foreground outline-none transition-colors focus:border-accent"
          />
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="w-full rounded-sm border border-border bg-background px-3.5 py-2.5 text-[0.9rem] text-foreground outline-none transition-colors focus:border-accent"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-sm border border-border bg-background px-3.5 py-2.5 text-[0.9rem] text-foreground outline-none transition-colors focus:border-accent"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-sm bg-accent px-3 py-2.5 font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-4 border-t border-border pt-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importLoading}
            className="flex w-full items-center justify-center gap-2 rounded-sm border border-border px-3 py-2.5 text-[0.85rem] text-muted transition-colors hover:text-foreground hover:border-accent disabled:opacity-50"
          >
            <Upload size={16} />
            {importLoading ? "Importing…" : "Import Config"}
          </button>
        </div>

        {error && (
          <p className="mt-3 text-[0.82rem] text-danger">{error}</p>
        )}
      </div>
    </div>
  );
}
