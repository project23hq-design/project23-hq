import { requireOrg } from "@/lib/auth";
import { CreateEventForm } from "./create-form";

export const metadata = { title: "Create event" };

export default async function NewEvent({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { supabase, org } = await requireOrg(slug, ["owner", "manager"]);
  const [{ data: cats }, { data: cities }] = await Promise.all([
    supabase.from("categories").select("id, name").order("sort_order"),
    supabase.from("cities").select("id, name").order("sort_order"),
  ]);
  return (
    <CreateEventForm
      org={org.slug}
      orgName={org.name}
      categories={cats ?? []}
      cities={cities ?? []}
    />
  );
}
