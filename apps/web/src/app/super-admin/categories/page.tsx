import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Table,
  Td,
  Th,
} from "@project23/ui";
import { requirePlatformAdmin } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { deleteCategoryAction, saveCategoryAction } from "../actions";

export default async function Categories() {
  const { supabase } = await requirePlatformAdmin();
  const [{ data: categories }, { data: used }] = await Promise.all([
    supabase.from("categories").select("id, name, slug, sort_order").order("sort_order"),
    supabase.from("events").select("category_id").not("category_id", "is", null),
  ]);
  const counts = new Map<string, number>();
  for (const e of used ?? []) counts.set(e.category_id!, (counts.get(e.category_id!) ?? 0) + 1);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-medium tracking-[-0.02em] sm:text-[28px]">Categories</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Organizers pick one of these for every event, and buyers filter by them on Explore. Lower
          order numbers show first. Changes are audited.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Add a category</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveCategoryAction} submitLabel="Add category" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
              <Field label="Name" htmlFor="name" required>
                <Input name="name" maxLength={60} placeholder="e.g. Music" />
              </Field>
              <Field label="Order" htmlFor="sortOrder">
                <Input name="sortOrder" inputMode="numeric" defaultValue="100" />
              </Field>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
      {categories?.length ? (
        <Table>
          <thead>
            <tr>
              <Th>Name and order</Th>
              <Th>Events</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <Td>
                  <ActionForm
                    action={saveCategoryAction}
                    submitLabel="Save"
                    submitVariant="secondary"
                    inline
                  >
                    <input type="hidden" name="categoryId" value={c.id} />
                    <Input name="name" defaultValue={c.name} required className="h-9 w-48" />
                    <Input
                      name="sortOrder"
                      defaultValue={String(c.sort_order)}
                      inputMode="numeric"
                      aria-label="Order"
                      className="h-9 w-20"
                    />
                  </ActionForm>
                </Td>
                <Td>{counts.get(c.id) ?? 0}</Td>
                <Td>
                  {!counts.get(c.id) && (
                    <ActionForm
                      action={deleteCategoryAction}
                      submitLabel="Delete"
                      submitVariant="ghost"
                      confirm={`Delete “${c.name}”?`}
                      inline
                    >
                      <input type="hidden" name="categoryId" value={c.id} />
                    </ActionForm>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <p className="text-sm text-fg-muted">
          No categories yet. Add at least one so organizers can create events.
        </p>
      )}
    </div>
  );
}
