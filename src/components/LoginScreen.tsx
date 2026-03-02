import { useState, type FormEvent } from "react";
import { useMatrix } from "../contexts/MatrixContext";

export default function LoginScreen() {
  const { login } = useMatrix();
  const [serverUrl, setServerUrl] = useState("https://matrix.org");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
          {error && (
            <p className="mt-1 text-[0.82rem] text-danger">{error}</p>
          )}
        </form>
      </div>
    </div>
  );
}
