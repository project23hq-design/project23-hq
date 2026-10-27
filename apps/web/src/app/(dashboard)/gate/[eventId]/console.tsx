"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Camera, CameraOff, RotateCcw, Search, WifiOff, XCircle, AlertTriangle } from "lucide-react";
import { formatMoney } from "@project23/domain";
import { Alert, Button, Field, Input, Select, Tabs, TabsContent, TabsList, TabsTrigger } from "@project23/ui";
import { admitTicketAction, compAction, doorSaleAction, lookupAction, reentryAction, scanAction, statsAction, type ScanResult } from "../actions";

type Ev = { id: string; title: string; can_door_sell: boolean; can_issue_comps: boolean; can_override_reentry: boolean };
type TT = { id: string; name: string; kind: string; price_minor: number; remaining: number; admissions_per_unit: number };

function deviceId() {
  try {
    let id = localStorage.getItem("p23-device");
    if (!id) { id = crypto.randomUUID().slice(0, 12); localStorage.setItem("p23-device", id); }
    return id;
  } catch { return "unknown"; }
}

const RESULT_UI: Record<string, { tone: string; icon: React.ReactNode; title: string }> = {
  admitted: { tone: "bg-success text-black", icon: <CheckCircle2 className="size-12" />, title: "Admit" },
  reentry: { tone: "bg-info text-black", icon: <RotateCcw className="size-12" />, title: "Re-entry recorded" },
  already_checked_in: { tone: "bg-warning text-black", icon: <AlertTriangle className="size-12" />, title: "Already checked in" },
  invalid: { tone: "bg-danger text-white", icon: <XCircle className="size-12" />, title: "Invalid ticket" },
  wrong_event: { tone: "bg-danger text-white", icon: <XCircle className="size-12" />, title: "Wrong event" },
  refunded: { tone: "bg-danger text-white", icon: <XCircle className="size-12" />, title: "Refunded — not valid" },
  void: { tone: "bg-danger text-white", icon: <XCircle className="size-12" />, title: "Voided — not valid" },
  event_not_active: { tone: "bg-danger text-white", icon: <XCircle className="size-12" />, title: "Event not active" },
  error: { tone: "bg-surface-3 text-fg", icon: <AlertTriangle className="size-12" />, title: "Couldn't check" },
  offline: { tone: "bg-surface-3 text-fg", icon: <WifiOff className="size-12" />, title: "Not confirmed — no connection" },
};

/**
 * Online-only gate console. Admission is decided by the server (atomic first-scan wins);
 * this UI never shows a green result without a server response.
 */
export function GateConsole({ event, ticketTypes }: { event: Ev; ticketTypes: TT[] }) {
  const [result, setResult] = useState<(ScanResult & { offline?: boolean }) | null>(null);
  const [stats, setStats] = useState<{ valid: number; checked_in: number } | null>(null);
  const [online, setOnline] = useState(true);
  const [pending, start] = useTransition();
  const busy = useRef(false);
  const dev = useRef("unknown");
  const [deviceLabel, setDeviceLabel] = useState("…");

  const refreshStats = useCallback(() => { statsAction(event.id).then(setStats).catch(() => undefined); }, [event.id]);
  useEffect(() => {
    dev.current = deviceId();
    setDeviceLabel(dev.current);
    refreshStats();
    const on = () => setOnline(navigator.onLine);
    on();
    window.addEventListener("online", on); window.addEventListener("offline", on);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", on); };
  }, [refreshStats]);

  const run = useCallback((fn: () => Promise<ScanResult>) => {
    if (busy.current) return;
    busy.current = true;
    setResult(null); // never leave a previous green result on screen while a new check runs
    if (!navigator.onLine) { setResult({ result: "error", offline: true }); busy.current = false; return; }
    start(async () => {
      try {
        const r = await fn();
        setResult(r);
        if (r.result === "admitted" || r.result === "reentry") refreshStats();
        if ("vibrate" in navigator) navigator.vibrate(r.result === "admitted" ? 80 : [60, 60, 60]);
      } catch {
        setResult({ result: "error", offline: true });
      } finally {
        busy.current = false;
      }
    });
  }, [refreshStats]);

  const ui = result ? RESULT_UI[result.offline ? "offline" : result.result] ?? RESULT_UI.error! : null;

  return (
    <div className="mx-auto max-w-xl px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0"><Link href="/gate" className="text-xs text-fg-muted">← Events</Link><h1 className="truncate text-lg font-bold">{event.title}</h1></div>
        <div className="text-right text-sm tabular-nums" aria-live="polite">{stats ? <><span className="font-display text-xl font-bold">{stats.checked_in}</span><span className="text-fg-muted"> / {stats.valid} in</span></> : "—"}</div>
      </div>
      {!online && <Alert tone="danger" className="mb-3" title="Offline">Tickets can&apos;t be verified without a connection. Do not admit guests based on this screen until it reconnects.</Alert>}

      {ui && result && (
        <div role="status" aria-live="assertive" className={`mb-4 flex items-center gap-4 rounded-3xl p-5 ${ui.tone}`}>
          {ui.icon}
          <div className="min-w-0">
            <p className="font-display text-2xl font-extrabold">{ui.title}</p>
            {result.ticket_type && <p className="font-semibold">{result.ticket_type}{result.admissions_in_unit && result.admissions_in_unit > 1 ? ` · seat ${result.admission} of ${result.admissions_in_unit}` : ""}</p>}
            {result.attendee_name && <p>{result.attendee_name}</p>}
            {result.ticket_ref && <p className="font-mono text-sm opacity-80">{result.ticket_ref}</p>}
            {result.result === "already_checked_in" && result.first_checked_in_at && <p className="text-sm">First entry {new Date(result.first_checked_in_at).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" })}</p>}
            {result.message && <p className="text-sm">{result.message}</p>}
            {result.offline && <p className="text-sm">Check the connection and scan again.</p>}
          </div>
        </div>
      )}
      {result?.result === "already_checked_in" && event.can_override_reentry && result.ticket_id && <ReentryForm onSubmit={(reason) => run(() => reentryAction(event.id, result.ticket_id!, reason, dev.current))} />}

      <Tabs defaultValue="scan">
        <TabsList className="mb-4 w-full justify-between">
          <TabsTrigger value="scan">Scan</TabsTrigger><TabsTrigger value="search">Search</TabsTrigger>
          {event.can_door_sell && <TabsTrigger value="door">Door sale</TabsTrigger>}
          {event.can_issue_comps && <TabsTrigger value="comp">Comp</TabsTrigger>}
        </TabsList>
        <TabsContent value="scan"><Scanner onCode={(code) => run(() => scanAction(event.id, code, dev.current))} paused={pending} /></TabsContent>
        <TabsContent value="search"><Lookup eventId={event.id} onAdmit={(id) => run(() => admitTicketAction(event.id, id, dev.current))} /></TabsContent>
        {event.can_door_sell && <TabsContent value="door"><DoorSale eventId={event.id} types={ticketTypes.filter((t) => t.kind !== "complimentary")} onDone={refreshStats} /></TabsContent>}
        {event.can_issue_comps && <TabsContent value="comp"><Comp eventId={event.id} types={ticketTypes} onDone={refreshStats} /></TabsContent>}
      </Tabs>
      <p className="mt-6 text-center text-xs text-fg-subtle">Device {deviceLabel} · every scan is logged with your account and server time.</p>
    </div>
  );
}

function Scanner({ onCode, paused }: { onCode: (code: string) => void; paused: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const scanner = useRef<{ stop: () => void; destroy: () => void } | null>(null);
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  const startCam = async () => {
    setError(null);
    if (!window.isSecureContext) return setError("Camera scanning needs HTTPS (or localhost). Use Search or manual entry.");
    try {
      const QrScanner = (await import("qr-scanner")).default;
      const s = new QrScanner(video.current!, (r) => {
        const now = Date.now();
        if (r.data === last.current.code && now - last.current.at < 4000) return; // same code held in front of camera
        last.current = { code: r.data, at: now };
        onCode(r.data);
      }, { highlightScanRegion: true, maxScansPerSecond: 4, preferredCamera: "environment", returnDetailedScanResult: true });
      await s.start();
      scanner.current = s;
      setActive(true);
    } catch {
      setError("Couldn't open the camera. Allow camera access, or use Search/manual entry.");
    }
  };
  const stopCam = () => { scanner.current?.stop(); scanner.current?.destroy(); scanner.current = null; setActive(false); };
  useEffect(() => () => stopCam(), []);

  return (
    <div className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-3xl border border-line bg-black">
        <video ref={video} className="size-full object-cover" muted playsInline aria-label="Camera preview" />
        {!active && <div className="absolute inset-0 flex items-center justify-center"><Button size="lg" onClick={startCam}><Camera /> Start camera</Button></div>}
        {paused && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-semibold">Checking…</div>}
      </div>
      {active && <Button variant="secondary" onClick={stopCam}><CameraOff /> Stop camera</Button>}
      {error && <Alert tone="warning">{error}</Alert>}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { onCode(manual.trim()); setManual(""); } }}>
        <label className="sr-only" htmlFor="manual-code">Ticket code</label>
        <Input id="manual-code" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Paste/type QR code (P23T.…)" autoComplete="off" />
        <Button type="submit" variant="secondary" loading={paused}>Check</Button>
      </form>
    </div>
  );
}

function Lookup({ eventId, onAdmit }: { eventId: string; onAdmit: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Awaited<ReturnType<typeof lookupAction>>["rows"]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await lookupAction(eventId, q); setRows(r.rows); setErr(r.error ?? null); }); }}>
        <label className="sr-only" htmlFor="lookup">Search</label>
        <Input id="lookup" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ticket/order ref, or name/email (3+ letters)" />
        <Button type="submit" loading={pending} aria-label="Search"><Search /></Button>
      </form>
      {err && <Alert tone="warning">{err}</Alert>}
      <ul className="divide-y divide-line rounded-2xl border border-line">
        {rows.map((r) => (
          <li key={r.ticket_id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0"><p className="truncate font-medium">{r.holder_name}</p><p className="text-xs text-fg-muted">{r.ticket_type} · <span className="font-mono">{r.ticket_ref}</span>{r.first_checked_in_at ? " · checked in" : ""}{r.status !== "valid" ? ` · ${r.status}` : ""}</p></div>
            <Button size="sm" variant={r.first_checked_in_at || r.status !== "valid" ? "secondary" : "primary"} onClick={() => onAdmit(r.ticket_id)}>Check in</Button>
          </li>
        ))}
        {rows.length === 0 && <li className="p-4 text-center text-sm text-fg-muted">Search to find a ticket when a QR won&apos;t scan.</li>}
      </ul>
    </div>
  );
}

function ReentryForm({ onSubmit }: { onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (reason.trim().length >= 5) onSubmit(reason.trim()); }}>
      <label className="sr-only" htmlFor="reentry">Re-entry reason</label>
      <Input id="reentry" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Re-entry reason (e.g. stepped out to car)" />
      <Button type="submit" variant="secondary" disabled={reason.trim().length < 5}>Allow re-entry</Button>
    </form>
  );
}

function DoorSale({ eventId, types, onDone }: { eventId: string; types: TT[]; onDone: () => void }) {
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [idem, setIdem] = useState(() => crypto.randomUUID());
  return (
    <form className="grid gap-3" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      start(async () => {
        const r = await doorSaleAction(eventId, { ticketTypeId: String(f.get("tt")), quantity: Number(f.get("qty")), method: f.get("method") as "cash" | "pos_external", name: String(f.get("name") ?? ""), email: String(f.get("email") ?? ""), idem });
        if ("error" in r) setMsg({ tone: "danger", text: r.error! });
        else { setMsg({ tone: "success", text: `Sold · ${r.order.public_ref} · collect ${formatMoney(r.order.total_minor)}. Tickets are valid now — scan or search to admit.` }); setIdem(crypto.randomUUID()); onDone(); (e.target as HTMLFormElement).reset(); }
      });
    }}>
      <Alert>Door sales use the same inventory. Cash and external POS are collected by your team, recorded against your account — not as Paystack payments.</Alert>
      <Field label="Ticket" htmlFor="tt"><Select name="tt" required>{types.map((t) => <option key={t.id} value={t.id}>{t.name} · {formatMoney(t.price_minor)} · {t.remaining} left</option>)}</Select></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantity" htmlFor="qty"><Input name="qty" type="number" min={1} max={20} defaultValue={1} /></Field>
        <Field label="Payment" htmlFor="method"><Select name="method"><option value="cash">Cash</option><option value="pos_external">External POS</option></Select></Field>
      </div>
      <Field label="Buyer name (optional)" htmlFor="name"><Input name="name" /></Field>
      <Field label="Buyer email (optional, to send tickets)" htmlFor="email"><Input name="email" type="email" /></Field>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Button type="submit" loading={pending}>Record sale</Button>
    </form>
  );
}

function Comp({ eventId, types, onDone }: { eventId: string; types: TT[]; onDone: () => void }) {
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [idem, setIdem] = useState(() => crypto.randomUUID());
  return (
    <form className="grid gap-3" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      start(async () => {
        const r = await compAction(eventId, { ticketTypeId: String(f.get("tt")), quantity: Number(f.get("qty")), name: String(f.get("name")), email: String(f.get("email")), reason: String(f.get("reason")), idem });
        if ("error" in r) setMsg({ tone: "danger", text: r.error! });
        else { setMsg({ tone: "success", text: `Issued ${r.order.public_ref}. Tickets were emailed to the guest.` }); setIdem(crypto.randomUUID()); onDone(); }
      });
    }}>
      <Alert>Complimentary tickets count toward capacity, carry no payment, and are audited with your reason.</Alert>
      <Field label="Ticket" htmlFor="ctt"><Select name="tt" id="ctt">{types.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.remaining} left</option>)}</Select></Field>
      <Field label="Quantity" htmlFor="cqty"><Input id="cqty" name="qty" type="number" min={1} max={10} defaultValue={1} /></Field>
      <Field label="Guest name" htmlFor="cname"><Input id="cname" name="name" required /></Field>
      <Field label="Guest email" htmlFor="cemail"><Input id="cemail" name="email" type="email" required /></Field>
      <Field label="Reason" htmlFor="creason"><Input id="creason" name="reason" required minLength={3} /></Field>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Button type="submit" loading={pending}>Issue complimentary</Button>
    </form>
  );
}
