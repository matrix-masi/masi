import { useMatrix } from "../contexts/MatrixContext";

export default function CryptoBanner() {
  const { showCryptoBanner, openRecoveryModal } = useMatrix();

  if (!showCryptoBanner) return null;

  return (
    <div className="flex items-center justify-between gap-2 border-b border-crypto-border bg-crypto-bg px-4 py-2 text-[0.82rem] text-crypto-text">
      <span className="min-w-0 flex-1">
        🔒 Some messages couldn't be decrypted.
      </span>
      <button
        onClick={openRecoveryModal}
        className="shrink-0 rounded-sm bg-crypto-border px-3 py-1.5 text-[0.78rem] font-semibold text-crypto-text transition-colors hover:bg-[#7a6328]"
      >
        Enter Recovery Key
      </button>
    </div>
  );
}
