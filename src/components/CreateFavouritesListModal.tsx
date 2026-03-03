import { useState, useEffect, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useFavourites } from "../hooks/useFavourites";

interface CreateFavouritesListModalProps {
  onClose: () => void;
  onCreated?: (roomId: string) => void;
}

export default function CreateFavouritesListModal({
  onClose,
  onCreated,
}: CreateFavouritesListModalProps) {
  const { createFavouritesList } = useFavourites();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [onClose]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    setError(null);
    try {
      const roomId = await createFavouritesList(trimmed);
      onCreated?.(roomId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create list");
    } finally {
      setCreating(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/75 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[400px] max-w-full rounded-[14px] border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-[1rem] font-semibold">New Favourites List</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-muted transition-colors hover:text-foreground"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-4 py-4">
          <label className="mb-1 block text-[0.8rem] text-muted">List name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Saved memes"
            autoFocus
            className="mb-3 w-full rounded-sm border border-border bg-background px-3 py-2 text-[0.9rem] text-foreground outline-none transition-colors focus:border-accent"
          />
          {error && (
            <p className="mb-2 text-[0.8rem] text-danger">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm px-3 py-1.5 text-[0.85rem] text-muted transition-colors hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || creating}
              className="rounded-sm bg-accent px-4 py-1.5 text-[0.85rem] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
