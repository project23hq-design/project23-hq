import Link from "next/link";
import { Button } from "@project23/ui";
export default function NotFound() {
  return (
    <main
      id="main"
      className="container-page flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center"
    >
      <p className="font-display text-7xl font-extrabold text-accent">404</p>
      <h1 className="text-2xl font-bold">We couldn&apos;t find that page</h1>
      <p className="max-w-md text-fg-muted">
        The event may have ended or the link may be private. Try exploring what&apos;s on.
      </p>
      <Button asChild>
        <Link href="/explore">Explore events</Link>
      </Button>
    </main>
  );
}
