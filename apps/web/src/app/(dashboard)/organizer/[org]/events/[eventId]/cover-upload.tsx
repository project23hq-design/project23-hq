"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Alert, Button } from "@project23/ui";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { setCoverAction } from "../../actions";

const MAX = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/** Uploads to the public event-media bucket under {orgId}/{eventId}/ (storage RLS checks membership). */
export function CoverUpload({ org, orgId, eventId }: { org: string; orgId: string; eventId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const onFile = (file: File) => {
    setError(null);
    if (!TYPES.includes(file.type)) return setError("Use a JPG, PNG, WebP or AVIF image.");
    if (file.size > MAX) return setError("Image must be 5 MB or smaller.");
    start(async () => {
      const ext = file.type.split("/")[1];
      const path = `${orgId}/${eventId}/cover-${Date.now()}.${ext}`;
      const { error: upErr } = await createBrowserSupabase().storage.from("event-media").upload(path, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });
      if (upErr) return setError(upErr.message);
      const r = await setCoverAction(org, eventId, path);
      if (r.error) return setError(r.error);
      router.refresh();
    });
  };
  return (
    <div className="space-y-2">
      <Button asChild variant="secondary" className="w-full" loading={pending}>
        <label className="cursor-pointer"><Upload /> {pending ? "Uploading…" : "Upload poster (4:5)"}
          <input type="file" accept={TYPES.join(",")} className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
      </Button>
      <p className="text-xs text-fg-subtle">Portrait 1080×1350 recommended, max 5 MB. Without a poster we generate a typographic one.</p>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
