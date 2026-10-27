import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, ChevronRight, Plus, ScanLine } from "lucide-react";
import { Button, Card, EmptyState } from "@project23/ui";
import { getMyOrganizations, requireUser } from "@/lib/auth";
import { PageHeader, WorkspaceTopBar } from "@/components/dashboard-shell";

export const metadata = { title: "Organizer" };

export default async function OrganizerHome() {
  await requireUser("/organizer");
  const orgs = await getMyOrganizations();
  const manageable = orgs.filter((o) => o.role !== "scanner");
  if (manageable.length === 1) redirect(`/organizer/${manageable[0]!.slug}`);
  return (
    <>
      <WorkspaceTopBar />
      <main id="main" className="mx-auto max-w-xl px-4 py-8 sm:py-12">
        <PageHeader title="Your organizations" />
        {manageable.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Building2 />}
              title="Start selling tickets"
              action={
                <Button asChild>
                  <Link href="/organizer/new">Create an organization</Link>
                </Button>
              }
            >
              Set up your organizer profile, publish events after a quick review, and get paid out
              in naira.
            </EmptyState>
          </Card>
        ) : (
          <ul className="grid grid-cols-1 gap-2">
            {manageable.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/organizer/${o.slug}`}
                  className="group flex items-center gap-4 rounded-xl bg-white/[0.04] p-4 transition-colors hover:bg-white/[0.07]"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-200 font-semibold text-black">
                    {o.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">{o.name}</span>
                    <span className="block text-xs capitalize text-fg-muted">{o.role}</span>
                  </span>
                  <ChevronRight className="size-4 text-fg-subtle group-hover:text-fg" />
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/organizer/new"
                className="flex items-center gap-4 rounded-xl p-4 text-sm font-medium text-fg-muted hover:bg-white/[0.04] hover:text-fg"
              >
                <span className="flex size-10 items-center justify-center rounded-lg border border-dashed border-white/[0.15]">
                  <Plus className="size-4" />
                </span>
                Create another organization
              </Link>
            </li>
          </ul>
        )}
        {orgs.some((o) => o.role === "scanner") && (
          <Link
            href="/gate"
            className="mt-8 flex items-center gap-3 rounded-xl bg-white/[0.04] p-4 text-sm hover:bg-white/[0.07]"
          >
            <ScanLine className="size-5" /> Working an event door? Open the gate scanner
          </Link>
        )}
      </main>
    </>
  );
}
