import { Input, Table, Td, Th } from "@project23/ui";
import { requirePlatformAdmin } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { settingAction } from "../actions";

export default async function Settings() {
  const { supabase } = await requirePlatformAdmin();
  const { data } = await supabase.from("platform_settings").select("*").order("key");
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Platform settings</h1>
      <p className="text-sm text-fg-muted">
        Changes are audited with the old and new values. Values are JSON. Staff platform roles are
        provisioned out-of-band (see docs/operations.md), never through this UI or signup.
      </p>
      <Table>
        <thead>
          <tr>
            <Th>Key</Th>
            <Th>Description</Th>
            <Th>Value</Th>
          </tr>
        </thead>
        <tbody>
          {data?.map((s) => (
            <tr key={s.key}>
              <Td className="font-mono text-xs">{s.key}</Td>
              <Td className="text-xs text-fg-muted">{s.description}</Td>
              <Td>
                <ActionForm
                  action={settingAction}
                  submitLabel="Save"
                  submitVariant="secondary"
                  inline
                >
                  <input type="hidden" name="key" value={s.key} />
                  <Input
                    name="value"
                    defaultValue={JSON.stringify(s.value)}
                    className="h-9 w-40 font-mono"
                  />
                  <Input name="reason" placeholder="Reason" required className="h-9 w-32" />
                </ActionForm>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
