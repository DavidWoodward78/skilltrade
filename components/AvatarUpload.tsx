"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "./Avatar";

/** Crops to a centered square and resizes to 512px JPEG before upload. */
async function toSquareJpeg(file: File, size = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not process image"))), "image/jpeg", 0.85),
  );
}

export function AvatarUpload({ userId, name, url }: { userId: string; name: string; url: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(url);
  const router = useRouter();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Choose an image file.");
    setBusy(true);
    setError(null);
    try {
      const blob = await toSquareJpeg(file);
      const supabase = createClient();
      const path = `${userId}/${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, blob, {
        contentType: "image/jpeg",
        cacheControl: "31536000",
      });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: dbErr } = await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", userId);
      if (dbErr) throw dbErr;
      // clean up older photos
      const { data: old } = await supabase.storage.from("avatars").list(userId);
      const stale = (old ?? []).map((o) => `${userId}/${o.name}`).filter((p) => p !== path);
      if (stale.length) await supabase.storage.from("avatars").remove(stale);
      setPreview(data.publicUrl);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Try a smaller image.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    const supabase = createClient();
    await supabase.from("profiles").update({ avatar_url: "" }).eq("id", userId);
    const { data: old } = await supabase.storage.from("avatars").list(userId);
    if (old?.length) await supabase.storage.from("avatars").remove(old.map((o) => `${userId}/${o.name}`));
    setPreview("");
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="group relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
        aria-label="Change profile photo"
      >
        <Avatar name={name} url={preview} size={88} />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
          {busy ? "…" : "Change"}
        </span>
      </button>
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="rounded-xl bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {busy ? "Uploading…" : preview ? "Change photo" : "Add a photo"}
        </button>
        {preview && !busy && (
          <button type="button" onClick={remove} className="ml-2 text-xs text-stone-500 hover:text-rose-700">
            Remove
          </button>
        )}
        <p className="text-xs text-stone-500">People trade with faces they can see. JPG or PNG, up to 2 MB.</p>
        {error && <p className="text-xs text-rose-700">{error}</p>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFile} />
    </div>
  );
}
