import { notFound } from "next/navigation";
import { StaticPage } from "@/components/static-page";

const DOCS: Record<string, { title: string; body: [string, string][] }> = {
  terms: {
    title: "Terms of use",
    body: [
      [
        "Who we are",
        "Project23 provides a marketplace where independent organizers sell tickets to their events. Unless an event is labelled Project23 Events, the organizer — not Project23 — is responsible for the event.",
      ],
      [
        "Tickets",
        "A ticket is a revocable licence to attend the event, subject to the organizer's entry rules. Tickets may be voided if refunded, charged back, or obtained fraudulently.",
      ],
      [
        "Payments",
        "Payments are processed by Paystack. Prices are in Nigerian naira and all charges are shown before you pay.",
      ],
      [
        "Acceptable use",
        "No scraping, ticket fraud, abuse of promoter links, or attempts to bypass security.",
      ],
    ],
  },
  privacy: {
    title: "Privacy notice",
    body: [
      [
        "What we collect",
        "Name, email, optional phone, order and ticket details, and limited technical data needed for security. We never see or store card numbers.",
      ],
      [
        "Who sees it",
        "The organizer of an event you buy for sees the details needed to run the event (name, email, phone if given, tickets). Promoters never see buyer identities.",
      ],
      [
        "Promoter attribution",
        "A first-party cookie records the last promoter link you opened for an event (up to 60 days). We don't use fingerprinting.",
      ],
      [
        "Retention & deletion",
        "You can ask us to delete your account. Order and financial records are retained as long as required for accounting, tax and fraud prevention, then deleted or anonymised.",
      ],
      [
        "Nigeria Data Protection Act",
        "We intend to meet NDPA 2023 obligations; this draft must be reviewed by counsel before launch.",
      ],
    ],
  },
  "organizer-terms": {
    title: "Organizer terms",
    body: [
      [
        "Approval and verification",
        "New organizers are reviewed before publishing. Public verification and payout eligibility are separate checks.",
      ],
      [
        "Fees",
        "Project23 deducts its platform fee from ticket proceeds as shown in your dashboard. The fee applied to each order is fixed at the time of purchase.",
      ],
      [
        "Payouts",
        "Online ticket revenue is collected by Project23 and paid out after the event and a holding period, net of fees, promoter commissions, refunds and chargebacks.",
      ],
      [
        "Refunds and cancellations",
        "You must honour your published refund policy. Cancelling an event refunds all buyers automatically.",
      ],
      [
        "Promoter programs",
        "Commissions you offer are paid from your proceeds and cannot be withdrawn by you once allocated.",
      ],
    ],
  },
  "refund-policy": {
    title: "Refund policy",
    body: [
      [
        "Event policies",
        "Each organizer sets a refund policy shown on the event page: no refunds, until 24 hours before, until 7 days before, or custom terms.",
      ],
      [
        "Cancelled events",
        "If an event is cancelled, every paid order is refunded automatically to the original payment method.",
      ],
      [
        "Late payments",
        "If your payment arrives after the tickets you chose sold out, no tickets are issued and you're refunded in full automatically.",
      ],
      [
        "Fees",
        "Booking fees (if any) are not refunded on buyer-requested refunds, but are refunded when the organizer or Project23 refunds an entire order.",
      ],
      [
        "Timing",
        "Refunds are submitted to Paystack immediately once approved; banks typically take several working days to return funds.",
      ],
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}
export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }) {
  return { title: DOCS[(await params).doc]?.title ?? "Not found" };
}

export default async function Legal({ params }: { params: Promise<{ doc: string }> }) {
  const d = DOCS[(await params).doc];
  if (!d) notFound();
  return (
    <StaticPage title={d.title} draft>
      {d.body.map(([h, p]) => (
        <section key={h}>
          <h2>{h}</h2>
          <p>{p}</p>
        </section>
      ))}
    </StaticPage>
  );
}
