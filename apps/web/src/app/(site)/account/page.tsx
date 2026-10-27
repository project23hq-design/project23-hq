import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@project23/ui";
import { requireUser, getMyOrganizations } from "@/lib/auth";
import { ProfileForm } from "./forms";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const { supabase, user } = await requireUser();
  await supabase.rpc("link_my_orders");
  const [{ data: profile }, orgs] = await Promise.all([
    supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle(),
    getMyOrganizations(),
  ]);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        <h1 className="text-3xl font-medium">
          Hi{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-1 text-fg-muted">
          {user.email}
          {user.email_confirmed_at ? " · verified" : " · not verified"}
        </p>
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileForm fullName={profile?.full_name ?? ""} phone={profile?.phone ?? ""} />
          </CardContent>
        </Card>
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Your organizations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {orgs.length === 0 && (
              <p className="text-fg-muted">Sell tickets for your own events.</p>
            )}
            {orgs.map((o) => (
              <Link
                key={o.id}
                href={`/organizer/${o.slug}`}
                className="block rounded-xl px-3 py-2 hover:bg-surface-2"
              >
                {o.name} <span className="text-fg-subtle">· {o.role}</span>
              </Link>
            ))}
            <Link href="/organizer/new" className="block px-3 py-2 font-medium text-brand">
              + Create an organization
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Earn as a promoter</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-fg-muted">
            Share events you love and earn commission on verified ticket sales.{" "}
            <Link className="text-brand" href="/promoter">
              Open promoter dashboard
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
