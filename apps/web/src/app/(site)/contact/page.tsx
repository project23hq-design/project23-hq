import Link from "next/link";
import { StaticPage } from "@/components/static-page";
import { createClient } from "@/lib/supabase/server";
export const metadata = { title: "Contact" };
export default async function Contact() {
  const supabase = await createClient();
  const { data } = await supabase.from("platform_settings").select("value").eq("key", "support_email").maybeSingle();
  const email = (data?.value as string) ?? "support@project23.example";
  return (
    <StaticPage title="Contact & support">
      <p>For questions about a specific event (times, venue, refunds under the event&apos;s policy), contact the organizer listed on the event page first.</p>
      <p>For help with payments, missing tickets or account access, email <a href={`mailto:${email}`}>{email}</a> with your order reference (for example P23-ABCD1234). Never send card details or passwords.</p>
      <p>Lost your tickets? Use <Link href="/orders/lookup">Find my tickets</Link> to get a secure link by email.</p>
    </StaticPage>
  );
}
