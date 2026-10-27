import { redirect } from "next/navigation";
import { Card } from "@project23/ui";
import { getSession } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { acceptInvitationAction } from "@/app/(dashboard)/organizer/[org]/actions";

export const metadata = { title: "Team invitation", robots: { index: false } };

/** Accepting requires being signed in with the invited, verified email address (checked in the database). */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { user } = await getSession();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`);
  return (
    <div className="container-page flex justify-center py-16">
      <Card className="w-full max-w-md space-y-4 p-6">
        <h1 className="text-2xl font-bold">Join an organization</h1>
        <p className="text-sm text-fg-muted">You&apos;re signed in as <strong className="text-fg">{user.email}</strong>. The invitation only works for the email address it was sent to.</p>
        <ActionForm action={acceptInvitationAction} submitLabel="Accept invitation"><input type="hidden" name="token" value={token} /></ActionForm>
      </Card>
    </div>
  );
}
