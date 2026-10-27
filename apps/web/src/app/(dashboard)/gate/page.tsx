import Link from "next/link";
import { ChevronRight, ScanLine } from "lucide-react";
import { formatEventDate } from "@project23/domain";
import { Card, EmptyState } from "@project23/ui";
import { requireUser } from "@/lib/auth";
import { PageHeader, WorkspaceTopBar } from "@/components/dashboard-shell";

export const metadata = { title: "Gate" };

export default async function GateHome() {
  const { supabase } = await requireUser("/gate");
  const { data } = await supabase.rpc("my_gate_events");
  const events = (data ?? []) as {
    id: string;
    title: string;
    starts_at: string;
    timezone: string;
    venue_name: string | null;
    status: string;
  }[];
  return (
    <>
      <WorkspaceTopBar />
      <main id="main" className="mx-auto max-w-xl px-4 py-8 sm:py-12">
        <PageHeader
          eyebrow="Gate"
          title="Choose an event to check in"
          description="Scans are verified by the server — one admission per ticket."
        />
        {events.length === 0 ? (
          <Card>
            <EmptyState icon={<ScanLine />} title="No events assigned">
              An organizer must assign you to an event before you can scan tickets.
            </EmptyState>
          </Card>
        ) : (
          <ul className="grid grid-cols-1 gap-2">
            {events.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/gate/${e.id}`}
                  className="group flex items-center gap-4 rounded-xl bg-white/[0.04] p-4 transition-colors hover:bg-white/[0.07]"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
                    <ScanLine className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">{e.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-fg-muted">
                      {formatEventDate(e.starts_at, e.timezone)}
                      {e.venue_name ? ` · ${e.venue_name}` : ""}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-fg-subtle group-hover:text-fg" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
