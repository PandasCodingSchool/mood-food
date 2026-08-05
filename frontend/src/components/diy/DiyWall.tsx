import { useRef, useState } from "react";
import { uploadWallPhoto } from "../../services/diy";

interface DiyWallProps {
  sessionId: string;
  dishName: string;
  onDone: () => void;
}

/** Stage 4 — photo capture, food-only moderation gate, locked "coming soon" wall. */
export default function DiyWall({ sessionId, dishName, onDone }: DiyWallProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "locked" | "rejected" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setPhotoUrl(dataUrl);
      setStatus("uploading");
      setMessage(null);

      const base64 = dataUrl.split(",")[1] || "";
      const result = await uploadWallPhoto(sessionId, base64, file.type || "image/jpeg");
      if (result.rejected) {
        setStatus("rejected");
        setMessage(result.reason || "That doesn't look like food — try another photo.");
      } else if (result.locked) {
        setStatus("locked");
        setMessage(null);
      } else if (!result.success) {
        setStatus("error");
        setMessage(result.error || "Could not upload your photo.");
      } else {
        setStatus("idle");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleShare = async () => {
    if (!photoUrl || !navigator.share) return;
    try {
      const blob = await (await fetch(photoUrl)).blob();
      const file = new File([blob], "dish.jpg", { type: blob.type });
      await navigator.share({ files: [file], title: dishName });
    } catch {
      // user dismissed the share sheet
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {photoUrl ? (
        <div className="relative rounded-2xl overflow-hidden">
          <img src={photoUrl} alt={dishName} className="w-full h-64 object-cover" />
          {status === "locked" && (
            <div className="absolute inset-0 bg-white/75 flex flex-col items-center justify-center text-center px-6">
              <span className="text-3xl">🔒</span>
              <p className="text-sm font-extrabold text-gray-900 mt-2">Wall — coming soon</p>
              <p className="text-xs text-gray-500 mt-1">
                Your photo passed the food check ✓ — saving to a public wall is launching soon.
              </p>
            </div>
          )}
          {status === "uploading" && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          className="h-64 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2"
        >
          <span className="text-4xl">📷</span>
          <span className="text-sm font-bold text-gray-500">Take a photo of {dishName}</span>
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {message && (
        <div className={`p-3 rounded-xl ${status === "rejected" ? "bg-red-50" : "bg-orange-50"}`}>
          <p className={`text-xs font-semibold ${status === "rejected" ? "text-red-600" : "text-orange-600"}`}>
            {message}
          </p>
        </div>
      )}

      {(status === "rejected" || status === "error") && (
        <button
          onClick={() => {
            setPhotoUrl(null);
            setStatus("idle");
            setMessage(null);
          }}
          className="text-xs font-bold text-orange-600"
        >
          Try another photo
        </button>
      )}

      {photoUrl && (status === "locked" || status === "idle") && (
        <div className="flex flex-col gap-2">
          {typeof navigator !== "undefined" && "share" in navigator && (
            <button
              onClick={handleShare}
              className="w-full py-3.5 rounded-full font-black text-white text-sm bg-gradient-to-r from-orange-500 to-amber-400"
            >
              📤 Share your dish
            </button>
          )}
          <button onClick={onDone} className="w-full py-3 rounded-full font-bold text-gray-500 text-sm">
            Done
          </button>
        </div>
      )}
    </div>
  );
}
