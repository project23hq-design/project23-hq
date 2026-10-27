import { ROLE_LABELS, type OrgRole, formatDateTime } from "@project23/domain";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  Table,
  Td,
  Th,
} from "@project23/ui";
import { requireOrg } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { inviteMemberAction, memberAction } from "../actions";

export default async function Team({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { supabase, org, user } = await requireOrg(slug, ["owner", "manager"]);
  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.rpc("org_members", { p_org: org.id }),
    supabase
      .from("invitations")
      .select("id, email, role, expires_at")
      .eq("organization_id", org.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString()),
  ]);
  const isOwner = org.role === "owner";
  const roles: OrgRole[] = isOwner
    ? ["owner", "manager", "finance", "scanner"]
    : ["manager", "scanner"];
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-medium">Team</h1>
      <Card>
        <CardHeader>
          <CardTitle>Roles</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-fg-muted">
          <p>
            <strong className="text-fg">Owner</strong> — everything, including bank details and team
            roles. <strong className="text-fg">Manager</strong> — events, tickets, attendees,
            refunds. <strong className="text-fg">Finance</strong> — orders, balances and
            withdrawals; no attendee lists or bank changes.{" "}
            <strong className="text-fg">Event staff</strong> — scan tickets only for events
            they&apos;re assigned to.
          </p>
        </CardContent>
      </Card>
      <Table>
        <thead>
          <tr>
            <Th>Member</Th>
            <Th>Role</Th>
            <Th>Joined</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {members?.map((m) => (
            <tr key={m.user_id}>
              <Td>
                {m.full_name ?? "—"}
                <p className="text-xs text-fg-subtle">{m.email}</p>
              </Td>
              <Td>
                <Badge>{ROLE_LABELS[m.role as OrgRole]}</Badge>
              </Td>
              <Td>{formatDateTime(m.joined_at)}</Td>
              <Td>
                {(isOwner || m.user_id === user.id) && (
                  <div className="flex flex-wrap gap-2">
                    {isOwner && (
                      <ActionForm
                        action={memberAction}
                        submitLabel="Change"
                        submitVariant="secondary"
                        inline
                      >
                        <input type="hidden" name="org" value={org.slug} />
                        <input type="hidden" name="op" value="role" />
                        <input type="hidden" name="userId" value={m.user_id} />
                        <Select name="role" defaultValue={m.role} className="h-9 w-36">
                          {(["owner", "manager", "finance", "scanner"] as OrgRole[]).map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </Select>
                      </ActionForm>
                    )}
                    <ActionForm
                      action={memberAction}
                      submitLabel={m.user_id === user.id ? "Leave" : "Remove"}
                      submitVariant="ghost"
                      inline
                      confirm="Remove this member?"
                    >
                      <input type="hidden" name="org" value={org.slug} />
                      <input type="hidden" name="op" value="remove" />
                      <input type="hidden" name="userId" value={m.user_id} />
                    </ActionForm>
                  </div>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {!!invites?.length && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2">
                  <span>
                    {i.email} · {ROLE_LABELS[i.role as OrgRole]} · expires{" "}
                    {formatDateTime(i.expires_at)}
                  </span>
                  <ActionForm
                    action={memberAction}
                    submitLabel="Revoke"
                    submitVariant="ghost"
                    inline
                  >
                    <input type="hidden" name="org" value={org.slug} />
                    <input type="hidden" name="op" value="revoke" />
                    <input type="hidden" name="userId" value="" />
                    <input type="hidden" name="invitationId" value={i.id} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Invite someone</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={inviteMemberAction} submitLabel="Send invitation" resetOnSuccess>
            <input type="hidden" name="org" value={org.slug} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email" htmlFor="email">
                <Input name="email" type="email" required />
              </Field>
              <Field label="Role" htmlFor="role">
                <Select name="role">
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
