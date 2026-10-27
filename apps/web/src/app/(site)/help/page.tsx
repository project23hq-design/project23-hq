import { StaticPage } from "@/components/static-page";
export const metadata = { title: "Help centre" };
const QA: [string, string][] = [
  ["Do I need an account to buy tickets?", "No. Enter your name and email at checkout. Your tickets are emailed to you, and you can always get a secure link again from Find my tickets."],
  ["How do I get into the event?", "Show the QR code on your ticket (phone or printed PDF). Each QR admits one person once — the first scan wins, so keep your codes private."],
  ["I bought a table. How do my friends get in?", "A table or group product issues one separate ticket per guest. Forward each guest their own ticket from the PDF."],
  ["My payment went through but I didn't get tickets", "Payments are confirmed directly with Paystack, which can take a minute. Refresh your order page. If the tickets sold out while you were paying, you receive an automatic full refund instead."],
  ["Can I get a refund?", "Each event shows its refund policy. If the event is cancelled, paid orders are refunded automatically. Booking fees are not refunded on buyer-requested refunds."],
  ["What does 'Selling now' mean?", "It ranks events by tickets sold online on Project23 in the last 7 days. 'Featured' events are picked by our team."],
  ["How do promoter links work?", "When you open a promoter's link we store a first-party cookie for that event. If you buy within the program window on the same browser, the promoter earns a commission from the organizer. Your price does not change."],
];
export default function Help() {
  return (
    <StaticPage title="Help centre">
      {QA.map(([q, a]) => <section key={q}><h2>{q}</h2><p>{a}</p></section>)}
    </StaticPage>
  );
}
