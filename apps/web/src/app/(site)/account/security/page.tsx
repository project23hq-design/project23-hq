import { Alert, Card, CardContent, CardHeader, CardTitle } from "@project23/ui";
import { requireUser } from "@/lib/auth";
import { ReauthForm } from "../forms";
import { MfaPanel } from "./mfa";

export const metadata = { title: "Security" };

export default async function Security({ searchParams }: { searchParams: Promise<{ mfa?: string; next?: string }> }) {
  const sp = await searchParams;
  const { supabase, aal } = await requireUser("/account/security");
  const { data: roles } = await supabase.rpc("my_platform_roles");
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold">Security</h1>
      {sp.mfa === "required" && <Alert tone="warning" title="Two-factor authentication required">Platform administration requires an authenticator-app verified session.</Alert>}
      <Card><CardHeader><CardTitle>Two-factor authentication</CardTitle></CardHeader><CardContent>
        <MfaPanel currentAal={aal ?? "aal1"} next={sp.next?.startsWith("/") ? sp.next : undefined} recommended={(roles?.length ?? 0) > 0} />
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Confirm it&apos;s you</CardTitle></CardHeader><CardContent><ReauthForm /></CardContent></Card>
    </div>
  );
}
