"use client";
import { useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { Button } from "@project23/ui";

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="secondary" onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}><Copy /> {done ? "Copied" : "Copy link"}</Button>
      <Button size="sm" variant="ghost" onClick={() => navigator.share?.({ url: text }).catch(() => undefined)}><Share2 /> Share</Button>
    </div>
  );
}
