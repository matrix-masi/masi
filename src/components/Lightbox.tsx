import { useState, useEffect, useCallback } from "react";
import { useMatrix } from "../contexts/MatrixContext";
import { fetchMedia } from "../lib/media";

export default function Lightbox() {
  const { client, lightboxTarget, closeLightbox } = useMatrix();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!lightboxTarget || !client) {
      setBlobUrl(null);
      return;
    }
    let cancelled = false;
    fetchMedia(lightboxTarget.content as never, client).then((url) => {
      if (!cancelled) {
        if (url) setBlobUrl(url);
        else closeLightbox();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [lightboxTarget, client, closeLightbox]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
    },
    [closeLightbox]
  );

  useEffect(() => {
    if (lightboxTarget) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [lightboxTarget, handleKeyDown]);

  if (!lightboxTarget) return null;

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/[.92]"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeLightbox();
      }}
    >
      <button
        onClick={closeLightbox}
        className="absolute right-4 top-3 z-[101] bg-transparent text-[1.6rem] text-white"
      >
        ✕
      </button>
      <div>
        {blobUrl &&
          (lightboxTarget.type === "image" ? (
            <img
              src={blobUrl}
              className="max-h-[90vh] max-w-[94vw] rounded-sm"
              alt=""
            />
          ) : (
            <video
              src={blobUrl}
              controls
              autoPlay
              playsInline
              className="max-h-[90vh] max-w-[94vw] rounded-sm bg-black"
            />
          ))}
      </div>
    </div>
  );
}
