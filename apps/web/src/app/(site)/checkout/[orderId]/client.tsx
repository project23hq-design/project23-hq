"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Alert, Button } from "@project23/ui";
import { payAction } from "../actions";

export function PayButton({ orderId, label }: { orderId: string; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <Button
        size="lg"
        className="w-full"
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await payAction(orderId);
            if (r?.error) setError(r.error);
          })
        }
      >
        <Lock /> {label}
      </Button>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}

export function HoldCountdown({ until }: { until: string }) {
  const [left, setLeft] = useState(() => Math.max(0, new Date(until).getTime() - Date.now()));
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      const l = Math.max(0, new Date(until).getTime() - Date.now());
      setLeft(l);
      if (l === 0) {
        clearInterval(t);
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [until, router]);
  const m = Math.floor(left / 60000),
    s = Math.floor((left % 60000) / 1000);
  return (
    <p
      className="mt-3 inline-flex rounded-full bg-warning/15 px-3 py-1 text-sm font-medium text-warning"
      role="timer"
      aria-live="off"
    >
      Tickets held for {m}:{String(s).padStart(2, "0")}
    </p>
  );
}

export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
