import { Alert } from "@project23/ui";

export function StaticPage({ title, draft, children }: { title: string; draft?: boolean; children: React.ReactNode }) {
  return (
    <article className="container-page max-w-3xl pt-10">
      <h1 className="text-4xl font-extrabold">{title}</h1>
      {draft && <Alert tone="warning" className="mt-6" title="Draft — requires legal review">This text is a working draft for product development. It has not been reviewed by a lawyer and is not a statement of legal compliance.</Alert>}
      <div className="prose-event mt-8 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-fg">{children}</div>
    </article>
  );
}
