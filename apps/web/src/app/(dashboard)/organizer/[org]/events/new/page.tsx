import { Card, Field, Input, Select } from "@project23/ui";
import { requireOrg } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { createEventAction } from "../../actions";
import { SlugInput } from "./slug-input";

export default async function NewEvent({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { supabase, org } = await requireOrg(slug, ["owner", "manager"]);
  const { data: cats } = await supabase.from("categories").select("id, name").order("sort_order");
  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-bold">Create an event</h1>
      <p className="mt-2 text-fg-muted">
        Start with the basics — you&apos;ll add schedule, venue, tickets and policies next. Nothing
        is public until it&apos;s reviewed and published.
      </p>
      <Card className="mt-6 p-6">
        <ActionForm action={createEventAction} submitLabel="Create draft">
          <input type="hidden" name="org" value={org.slug} />
          <SlugInput />
          <Field
            label="Short summary"
            htmlFor="summary"
            hint="Shown on cards and social previews (max 280 characters)."
          >
            <Input name="summary" maxLength={280} />
          </Field>
          <Field label="Category" htmlFor="categoryId" required>
            <Select name="categoryId">
              <option value="">Select…</option>
              {cats?.map((c) => (
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
