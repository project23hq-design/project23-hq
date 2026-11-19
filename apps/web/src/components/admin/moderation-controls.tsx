import { Input, Select } from "@project23/ui";
import { ActionForm } from "@/components/action-form";
import {
  adminCancelEventAction,
  adminEventStatusAction,
  featureEventAction,
  updateOrgAction,
} from "@/app/super-admin/actions";

/** Approval / verification / payout / status changes for one organization (reason required). */
export function OrgControls({ orgId, className }: { orgId: string; className?: string }) {
  return (
    <ActionForm
      action={updateOrgAction}
      submitLabel="Apply"
      submitVariant="secondary"
      className={className ?? "grid gap-2 sm:grid-cols-3"}
    >
      <input type="hidden" name="orgId" value={orgId} />
      <Select name="approval_status" defaultValue="" aria-label="Approval">
        <option value="">Approval…</option>
        <option value="approved">approved</option>
        <option value="rejected">rejected</option>
        <option value="pending">pending</option>
      </Select>
      <Select name="verification_status" defaultValue="" aria-label="Verification">
        <option value="">Verification…</option>
        <option value="verified">verified</option>
        <option value="unverified">unverified</option>
      </Select>
      <Select name="payout_status" defaultValue="" aria-label="Payout eligibility">
        <option value="">Payouts…</option>
        <option value="eligible">eligible</option>
        <option value="pending_review">pending review</option>
        <option value="suspended">suspended</option>
        <option value="not_ready">not ready</option>
      </Select>
      <Select name="status" defaultValue="" aria-label="Status">
        <option value="">Status…</option>
        <option value="active">active</option>
        <option value="suspended">suspended</option>
      </Select>
      <Input
        name="reason"
        placeholder="Reason"
        required
        className="sm:col-span-2"
        aria-label="Reason"
      />
    </ActionForm>
  );
}

/** Featured placement for a live event. */
export function FeatureControl({
  eventId,
  featured,
  rank,
}: {
  eventId: string;
  featured: boolean;
  rank: number | null;
}) {
  return (
    <ActionForm
      action={featureEventAction}
      submitLabel={featured ? "Update" : "Feature"}
      submitVariant="secondary"
      inline
    >
      <input type="hidden" name="eventId" value={eventId} />
      <Select
        name="featured"
        defaultValue={String(featured)}
        className="h-9 w-24"
        aria-label="Featured"
      >
        <option value="true">On</option>
        <option value="false">Off</option>
      </Select>
      <Input
        name="rank"
        type="number"
        defaultValue={rank ?? ""}
        placeholder="Rank"
        className="h-9 w-20"
        aria-label="Featured rank"
      />
    </ActionForm>
  );
}

/** Pause / resume a live event. */
export function PauseControl({ eventId, status }: { eventId: string; status: string }) {
  const paused = status === "paused";
  return (
    <ActionForm
      action={adminEventStatusAction}
      submitLabel={paused ? "Resume" : "Pause"}
      submitVariant="secondary"
      inline
      confirm={paused ? undefined : "Pause sales and hide this event?"}
    >
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="status" value={paused ? "published" : "paused"} />
    </ActionForm>
  );
}

/** Cancel an event and refund every buyer (irreversible). */
export function CancelControl({ eventId }: { eventId: string }) {
  return (
    <details>
      <summary className="cursor-pointer text-sm text-danger">Cancel</summary>
      <ActionForm
        action={adminCancelEventAction}
        submitLabel="Cancel & refund all"
        submitVariant="danger"
        className="mt-2 grid w-64 gap-2"
        confirm="Cancel this event and refund every buyer?"
      >
        <input type="hidden" name="eventId" value={eventId} />
        <Input name="reason" placeholder="Reason" required aria-label="Cancellation reason" />
      </ActionForm>
    </details>
  );
}
