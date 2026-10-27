import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { Button, EmptyState } from "@project23/ui";
import { getMyOrganizations, requireUser } from "@/lib/auth";

export const metadata = { title: "Organizer" };

export default async function OrganizerHome() {
  await requireUser("/organizer");
  const orgs = await getMyOrganizations();
  const manageable = orgs.filter((o) => o.role !== "scanner");
  if (manageable.length === 1) redirect(`/organizer/${manageable[0]!.slug}`);
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-medium">Your organizations</h1>
      {manageable.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<Building2 />}
            title="Start selling tickets"
            action={
              <Button asChild>
                <Link href="/organizer/new">Create an organization</Link>
              </Button>
            }
          >
            Set up your organizer profile, publish events after a quick review, and get paid out in
            naira.
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {manageable.map((o) => (
            <li key={o.id}>
              <Link
                href={`/organizer/${o.slug}`}
                className="flex justify-between rounded-2xl border border-line bg-surface-1 p-4 hover:border-line-strong"
              >
                <span className="font-semibold">{o.name}</span>
                <span className="text-sm text-fg-muted">{o.role}</span>
              </Link>
            </li>
          ))}
          <li>
            <Link href="/organizer/new" className="block p-4 font-medium text-accent">
              + Create another organization
            </Link>
          </li>
        </ul>
      )}
      {orgs.some((o) => o.role === "scanner") && (
        <p className="mt-8 text-sm text-fg-muted">
          Working an event door? Go to the{" "}
          <Link className="text-accent" href="/gate">
            gate scanner
          </Link>
          .
        </p>
      )}
    </div>
  );
}
