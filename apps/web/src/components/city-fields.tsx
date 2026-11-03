import { Field, Input, Select } from "@project23/ui";

type Options = {
  cities: { id: string; name: string; state?: string }[];
  states: { code: string; name: string }[];
};

/** Free-typed city with suggestions from cities already in use, plus the state it's in. */
export function CityFields({
  options,
  cityId,
  required,
}: {
  options: Options;
  cityId?: string | null;
  required?: boolean;
}) {
  const current = options.cities.find((c) => c.id === cityId);
  const names = [...new Set(options.cities.map((c) => c.name))];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="City" htmlFor="city" required={required} hint="Type it — new cities are added.">
        <Input
          name="city"
          list="city-suggestions"
          autoComplete="address-level2"
          maxLength={80}
          defaultValue={current?.name ?? ""}
        />
      </Field>
      <datalist id="city-suggestions">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <Field label="State" htmlFor="state" required={required}>
        <Select name="state" defaultValue={current?.state ?? ""}>
          <option value="">Select…</option>
          {options.states.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
