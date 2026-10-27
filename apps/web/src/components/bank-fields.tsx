import { Field, Input, Select } from "@project23/ui";

/** NUBAN bank account fields. The bank name is resolved server-side from the bank code. */
export function BankFields({ banks }: { banks: { code: string; name: string }[] }) {
  return (
    <>
      <Field label="Bank" htmlFor="bankCode">
        <Select name="bankCode" required>
          <option value="">Select bank…</option>
          {banks.map((b) => (
            <option key={b.code} value={b.code}>
              {b.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Account number (NUBAN)" htmlFor="accountNumber">
        <Input
          name="accountNumber"
          inputMode="numeric"
          maxLength={10}
          pattern="[0-9]{10}"
          required
          autoComplete="off"
        />
      </Field>
      <Field
        label="Account name"
        htmlFor="accountName"
        hint="We confirm this with the bank before any payout."
      >
        <Input name="accountName" required />
      </Field>
    </>
  );
}
