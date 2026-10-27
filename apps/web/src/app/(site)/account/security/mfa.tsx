"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input } from "@project23/ui";
import { createBrowserSupabase } from "@/lib/supabase/browser";

/** TOTP enrolment and step-up to aal2 using Supabase Auth MFA. */
export function MfaPanel({ currentAal, next, recommended }: { currentAal: string; next?: string; recommended: boolean }) {
  const supabase = createBrowserSupabase();
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const f = data?.totp?.[0];
      if (f) { setFactorId(f.id); setVerified(f.status === "verified"); }
    });
  }, [supabase]);

  const enroll = async () => {
    setBusy(true); setError(null);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
    setBusy(false);
    if (error) return setError(error.message);
    setFactorId(data.id); setQr(data.totp.qr_code); setSecret(data.totp.secret);
  };

  const verify = async () => {
    if (!factorId) return;
    setBusy(true); setError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (error) return setError("That code didn't work. Check your authenticator app's time and try again.");
    setVerified(true); setQr(null);
    router.push(next ?? "/account/security");
    router.refresh();
  };

  if (verified && currentAal === "aal2") return <Alert tone="success">Two-factor authentication is on and this session is verified.</Alert>;
  return (
    <div className="space-y-4">
      {recommended && !verified && <p className="text-sm text-fg-muted">Your account has platform access. Two-factor authentication is mandatory for it.</p>}
      {!factorId && <Button onClick={enroll} loading={busy}>Set up authenticator app</Button>}
      {qr && (
        <div className="space-y-2">
          <p className="text-sm text-fg-muted">Scan with Google Authenticator, 1Password, Authy or similar, then enter the 6-digit code.</p>
          {/* Supabase returns an inline SVG data URI; next/image does not accept raw SVG markup. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Authenticator QR code" width={180} height={180} className="rounded-xl bg-white p-2" />
          {secret && <p className="font-mono text-xs text-fg-subtle">Manual key: {secret}</p>}
        </div>
      )}
      {factorId && (
        <div className="flex max-w-sm items-end gap-2">
          <Field label={verified ? "Enter your current code to verify this session" : "6-digit code"} htmlFor="totp" className="flex-1">
            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Button onClick={verify} loading={busy} disabled={code.trim().length !== 6}>Verify</Button>
        </div>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
