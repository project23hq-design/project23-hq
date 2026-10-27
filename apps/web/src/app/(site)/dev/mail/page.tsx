import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { CAPTURE_DIR } from "@/lib/email";

export const dynamic = "force-dynamic";
export const metadata = { title: "Captured email (dev)", robots: { index: false } };

/** Development-only inbox for EMAIL_PROVIDER=capture. Not available in production. */
export default async function DevMail({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  if (env().APP_ENV === "production" || env().EMAIL_PROVIDER !== "capture") notFound();
  const { id } = await searchParams;
  const files = (await readdir(CAPTURE_DIR).catch(() => []))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, 100);
  const items = await Promise.all(
    files.map(
      async (f) =>
        JSON.parse(await readFile(path.join(CAPTURE_DIR, f), "utf8")) as {
          id: string;
          to: string;
          subject: string;
          html: string;
          at: string;
          attachments: { filename: string }[];
        },
    ),
  );
  const current = items.find((m) => m.id === id) ?? items[0];
  return (
    <div className="container-page grid gap-6 pt-8 lg:grid-cols-[340px_1fr]">
      <div>
        <h1 className="mb-4 text-2xl font-bold">Captured email</h1>
        <ul className="space-y-1 text-sm">
          {items.map((m) => (
            <li key={m.id}>
              <a
                href={`/dev/mail?id=${encodeURIComponent(m.id)}`}
                className={`block rounded-xl p-2 hover:bg-surface-2 ${m.id === current?.id ? "bg-surface-2" : ""}`}
              >
                <p className="truncate font-medium">{m.subject}</p>
                <p className="truncate text-xs text-fg-muted">
                  {m.to} · {m.at}
                </p>
              </a>
            </li>
          ))}
        </ul>
        {!items.length && (
          <p className="text-fg-muted">
            No emails captured yet. Make sure the worker is running (pnpm worker).
          </p>
        )}
      </div>
      {current && (
        <div>
          <p className="mb-2 text-sm text-fg-muted">
            To {current.to} · attachments:{" "}
            {current.attachments.map((a) => a.filename).join(", ") || "none"}
          </p>
          <iframe
            title="Email preview"
            sandbox=""
            srcDoc={current.html}
            className="h-[80vh] w-full rounded-2xl bg-white"
          />
        </div>
      )}
    </div>
  );
}
