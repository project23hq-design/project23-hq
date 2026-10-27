import { Alert, Card, Field, Input, Select, Textarea } from "@project23/ui";
import { requireUser } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { createOrganizationAction } from "../[org]/actions";

export const metadata = { title: "Create organization" };

export default async function NewOrg() {
  const { supabase, user } = await requireUser("/organizer/new");
  const { data: cities } = await supabase.from("cities").select("id, name").order("sort_order");
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-medium">Create your organization</h1>
      <p className="mt-2 text-fg-muted">
        This is your public organizer profile. Project23 reviews new organizers before their first
        event goes live; payouts are enabled separately after bank and business verification.
      </p>
      {!user.email_confirmed_at && (
        <Alert tone="warning" className="mt-6">
          Verify your email address before creating an organization.
        </Alert>
      )}
      <Card className="mt-8 p-6">
        <ActionForm action={createOrganizationAction} submitLabel="Create organization">
          <Field label="Organization name" htmlFor="name" required>
            <Input name="name" maxLength={120} />
          </Field>
          <Field
            label="Profile URL"
            htmlFor="slug"
            required
            hint="project23.ng/organizers/your-name — lowercase letters, numbers, hyphens."
          >
            <Input name="slug" pattern="[a-z0-9-]{3,50}" />
          </Field>
          <Field label="About" htmlFor="description">
            <Textarea name="description" maxLength={4000} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact email" htmlFor="contactEmail">
              <Input name="contactEmail" type="email" />
            </Field>
            <Field label="Contact phone" htmlFor="contactPhone">
              <Input name="contactPhone" type="tel" placeholder="+234" />
            </Field>
          </div>
          <Field label="City" htmlFor="cityId">
            <Select name="cityId">
              <option value="">Select…</option>
              {cities?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </ActionForm>
      </Card>
    </div>
  );
}
