import { StaticPage } from "@/components/static-page";
export const metadata = { title: "About" };
export default function About() {
  return (
    <StaticPage title="About Project23">
      <p>
        Project23 is an event discovery and ticketing platform starting in Osun State — Osogbo,
        Ile-Ife, Ilesa, Ede and nearby towns — and built to grow across Nigeria.
      </p>
      <p>
        Organizers list concerts, comedy, campus nights, conferences, workshops and community
        events; buyers pay in naira and receive individual QR tickets by email; door teams check
        guests in from their phones.
      </p>
      <p>
        Project23 also produces its own events under <a href="/project23">Project23 Events</a>. They
        use exactly the same ticketing, payments and refund rules as every other organizer.
      </p>
    </StaticPage>
  );
}
