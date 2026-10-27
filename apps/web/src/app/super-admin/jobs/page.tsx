import { formatDateTime } from "@project23/domain";
import { Badge, Table, Td, Th } from "@project23/ui";
import { requirePlatformAdmin } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { retryJobAction } from "../actions";

export default async function Jobs() {
  const { supabase } = await requirePlatformAdmin();
  const [{ data: jobs }, { data: emails }] = await Promise.all([
    supabase
      .from("outbox_jobs")
      .select("*")
      .in("status", ["dead", "pending", "running"])
      .order("id", { ascending: false })
      .limit(100),
    supabase
      .from("email_messages")
      .select("id, template, to_email, status, attempts, last_error, created_at")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Jobs & delivery</h1>
      <p className="text-sm text-fg-muted">
        Jobs retry with exponential backoff (30s × 2ⁿ, max 6h) up to 8 attempts, then move to
        dead-letter. Email sends are deduplicated by intent key, so retries never send twice.
      </p>
      <Table>
        <thead>
          <tr>
            <Th>#</Th>
            <Th>Kind</Th>
            <Th>Status</Th>
            <Th>Attempts</Th>
            <Th>Next run</Th>
            <Th>Last error</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {jobs?.map((j) => (
            <tr key={j.id}>
              <Td>{j.id}</Td>
              <Td className="font-mono text-xs">{j.kind}</Td>
              <Td>
                <Badge tone={j.status === "dead" ? "danger" : "info"}>{j.status}</Badge>
              </Td>
              <Td>
                {j.attempts}/{j.max_attempts}
              </Td>
              <Td>{formatDateTime(j.run_after)}</Td>
              <Td className="max-w-64 truncate text-xs">{j.last_error}</Td>
              <Td>
                {j.status === "dead" && (
                  <ActionForm action={retryJobAction} submitLabel="Retry" inline>
                    <input type="hidden" name="jobId" value={j.id} />
                  </ActionForm>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <h2 className="text-xl font-bold">Failed emails</h2>
      <Table>
        <thead>
          <tr>
            <Th>Template</Th>
            <Th>To</Th>
            <Th>Attempts</Th>
            <Th>Error</Th>
          </tr>
        </thead>
        <tbody>
          {emails?.map((e) => (
            <tr key={e.id}>
              <Td>{e.template}</Td>
              <Td>{e.to_email}</Td>
              <Td>{e.attempts}</Td>
              <Td className="max-w-80 truncate text-xs">{e.last_error}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
