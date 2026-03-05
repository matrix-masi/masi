import { useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import { useSwarm } from "../contexts/SwarmContext";

export default function UnlockConfigScreen() {
  const { masterPasswordHint, unlockMasterConfig } = useSwarm();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const ok = await unlockMasterConfig(password);
      if (!ok) {
        setError("Incorrect password.");
        setLoading(false);
      }
    } catch {
      setError("Failed to decrypt configuration.");
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-[340px] max-w-[92vw] rounded-[14px] bg-surface p-8 text-center">
        <div className="mb-4 flex justify-center">
          <Lock size={32} className="text-accent" />
        </div>
        <h1 className="text-[1.8rem] font-bold tracking-tight">Locked</h1>
        <p className="mb-6 text-[0.85rem] text-muted">
          Your configuration is encrypted. Enter your master password to
          unlock.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            placeholder="Master password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
            className="w-full rounded-sm border border-border bg-background px-3.5 py-2.5 text-[0.9rem] text-foreground outline-none transition-colors focus:border-accent"
          />
          {masterPasswordHint && (
            <p className="text-left text-[0.78rem] text-muted">
              Hint: {masterPasswordHint}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="rounded-sm bg-accent px-3 py-2.5 font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Unlocking…" : "Unlock"}
          </button>
        </form>

        {error && (
          <p className="mt-3 text-[0.82rem] text-danger">{error}</p>
        )}
      </div>
    </div>
  );
}
