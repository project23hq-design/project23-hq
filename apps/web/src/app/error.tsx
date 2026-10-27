"use client";
import { Button } from "@project23/ui";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main
      id="main"
      className="container-page flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center"
    >
      <h1 className="text-2xl font-medium">Something went wrong</h1>
      <p className="max-w-md text-fg-muted">
        Please try again. If you were paying, don&apos;t pay twice — your order page updates once
        the payment is confirmed.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
