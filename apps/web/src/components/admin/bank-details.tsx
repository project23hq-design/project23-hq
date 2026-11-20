"use client";

import { useState, useTransition } from "react";
import { formatMoney } from "@project23/domain";
import { Button } from "@project23/ui";
import type { PayoutBankDetails } from "@/app/super-admin/actions";

/** Reveals the full account number of an approved manual payout so finance can pay it. */
export function BankDetailsReveal({
  payoutId,
  reveal,
}: {
  payoutId: string;
  reveal: (payoutId: string) => Promise<{ details?: PayoutBankDetails; error?: string }>;
}) {
  const [details, setDetails] = useState<PayoutBankDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!details)
    return (
      <div className="grid gap-1">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await reveal(payoutId);
              if (res.details) setDetails(res.details);
              else setError(res.error ?? "Couldn't load the bank details.");
            })
          }
        >
          {pending ? "Loading…" : "Show bank details"}
        </Button>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );

  const copy = (label: string, value: string) => {
    navigator.clipboard?.writeText(value).then(
      () => setCopied(label),
      () => setCopied(null),
    );
  };
  const rows: [string, string, boolean][] = [
    ["Account number", details.account_number, true],
    ["Account name", details.account_name, false],
    ["Bank", details.bank_name, false],
    ["Amount", formatMoney(details.amount_minor), false],
    ["Narration", `Project23 payout ${details.reference}`, true],
  ];
  return (
    <dl className="grid w-56 gap-2 rounded-md border border-border p-2.5 text-xs">
      {rows.map(([label, value, copyable]) => (
        <div key={label} className="min-w-0">
          <dt className="text-fg-subtle">{label}</dt>
          <dd className="flex items-start justify-between gap-2 font-medium">
            <span className={copyable ? "break-all font-mono" : "break-words"}>{value}</span>
            {copyable && (
              <button
                type="button"
                className="shrink-0 text-fg-subtle underline-offset-2 hover:text-fg hover:underline"
                onClick={() => copy(label, value)}
              >
                {copied === label ? "Copied" : "Copy"}
              </button>
            )}
          </dd>
        </div>
      ))}
      <p className="text-fg-subtle">Viewing these details is recorded in the audit log.</p>
    </dl>
  );
}
