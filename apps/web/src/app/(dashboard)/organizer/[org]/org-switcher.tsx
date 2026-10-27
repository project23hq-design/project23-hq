"use client";
import { useRouter } from "next/navigation";
import { Select } from "@project23/ui";

export function OrgSwitcher({ current, orgs }: { current: string; orgs: { slug: string; name: string; role: string }[] }) {
  const router = useRouter();
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-fg-subtle">Organization</span>
      <Select value={current} onChange={(e) => (e.target.value === "__new" ? router.push("/organizer/new") : router.push(`/organizer/${e.target.value}`))}>
        {orgs.map((o) => <option key={o.slug} value={o.slug}>{o.name} ({o.role})</option>)}
        <option value="__new">+ New organization</option>
      </Select>
    </label>
  );
}
