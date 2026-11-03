import { Card, Field, Input, Textarea } from "@project23/ui";
import { requireOrg } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { CityFields } from "@/components/city-fields";
import { cityOptions } from "@/lib/cities";
import { updateOrganizationAction } from "../actions";

export default async function Settings({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { supabase, org } = await requireOrg(slug, ["owner", "manager"]);
  const [{ data: o }, cities] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", org.id).single(),
    cityOptions(supabase),
  ]);
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-medium tracking-[-0.02em] sm:text-[28px]">Settings</h1>
      <Card className="p-6">
        <ActionForm action={updateOrganizationAction} submitLabel="Save">
          <input type="hidden" name="org" value={org.slug} />
          <Field label="Name" htmlFor="name">
            <Input name="name" defaultValue={o?.name} />
          </Field>
          <Field label="Public URL" htmlFor="slug-ro" hint="Contact support to change your URL.">
            <Input id="slug-ro" value={`/organizers/${o?.slug}`} disabled readOnly />
          </Field>
          <Field label="About" htmlFor="description">
            <Textarea name="description" defaultValue={o?.description ?? ""} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact email" htmlFor="contactEmail">
              <Input name="contactEmail" type="email" defaultValue={o?.contact_email ?? ""} />
            </Field>
            <Field label="Contact phone" htmlFor="contactPhone">
              <Input name="contactPhone" defaultValue={o?.contact_phone ?? ""} />
            </Field>
          </div>
          <CityFields options={cities} cityId={o?.city_id} />
        </ActionForm>
      </Card>
    </div>
  );
}
