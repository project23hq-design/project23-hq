"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlignLeft,
  CalendarDays,
  Eye,
  ImagePlus,
  MapPin,
  Plus,
  Settings2,
  Shapes,
  Ticket,
  Trash2,
  Users,
} from "lucide-react";
import { slugify } from "@project23/domain";
import { Alert, cn } from "@project23/ui";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { createEventFullAction, setCoverAction } from "../../actions";

type Opt = { id: string; name: string };
type TicketDraft = { name: string; price: string; quantity: number; admissionsPerUnit: number };

const row = "flex min-h-11 items-center gap-3 rounded-lg bg-white/[0.08] px-3 text-sm";
const chip =
  "h-9 rounded-md bg-white/[0.08] px-2.5 text-sm font-medium text-fg focus:outline-none focus:ring-1 focus:ring-white/30 [color-scheme:dark]";
const bare = "w-full bg-transparent py-2.5 text-sm placeholder:text-fg-muted focus:outline-none";

function local(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Single-page event creation laid out like the reference's /create screen. */
export function CreateEventForm({
  org,
  orgName,
  categories,
  cities,
}: {
  org: string;
  orgName: string;
  categories: Opt[];
  cities: Opt[];
}) {
  const router = useRouter();
  const defaults = useMemo(() => {
    const s = new Date();
    s.setDate(s.getDate() + 14);
    s.setHours(19, 0, 0, 0);
    const e = new Date(s.getTime() + 5 * 3600_000);
    return { start: local(s), end: local(e) };
  }, []);
  const [mode, setMode] = useState<"tickets" | "rsvp">("tickets");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState("");
  const [showDesc, setShowDesc] = useState(false);
  const [description, setDescription] = useState("");
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  const [format, setFormat] = useState<"in_person" | "online">("in_person");
  const [venueName, setVenueName] = useState("");
  const [address, setAddress] = useState("");
  const [cityId, setCityId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [capacity, setCapacity] = useState(200);
  const [explore, setExplore] = useState(true);
  const [tickets, setTickets] = useState<TicketDraft[]>([
    { name: "General Admission", price: "5000", quantity: 100, admissionsPerUnit: 1 },
  ]);
  const [cover, setCover] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start_] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const pickCover = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(f.type))
      return setError("Use a JPG, PNG, WebP or AVIF image.");
    if (f.size > 5 * 1024 * 1024) return setError("Cover image must be 5 MB or smaller.");
    setCover(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = () =>
    start_(async () => {
      setError(null);
      const res = await createEventFullAction({
        org,
        mode,
        title: title.trim(),
        slug: slug || slugify(title),
        summary: summary || undefined,
        description: description || undefined,
        categoryId,
        startsLocal: start,
        endsLocal: end,
        timezone: "Africa/Lagos",
        format,
        venueName: venueName || undefined,
        addressLine: address || undefined,
        cityId: cityId || undefined,
        capacity,
        visibility: explore ? "public" : "unlisted",
        tickets:
          mode === "rsvp"
            ? [
                {
                  name: tickets[0]?.name || "RSVP",
                  price: "0",
                  quantity: tickets[0]?.quantity ?? capacity,
                  admissionsPerUnit: 1,
                },
              ]
            : tickets,
      });
      if (res.error && !res.eventId) return setError(res.error);
      if (cover && res.eventId && res.orgId) {
        const path = `${res.orgId}/${res.eventId}/cover-${Date.now()}.${cover.type.split("/")[1]}`;
        const up = await createBrowserSupabase()
          .storage.from("event-media")
          .upload(path, cover, { contentType: cover.type, cacheControl: "31536000" });
        if (!up.error) await setCoverAction(org, res.eventId, path);
      }
      router.push(`/organizer/${org}/events/${res.eventId}?tab=publish&created=1`);
    });

  const updateTicket = (i: number, patch: Partial<TicketDraft>) =>
    setTickets((ts) => ts.map((t, k) => (k === i ? { ...t, ...patch } : t)));

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.6fr)]">
      <div className="min-w-0 space-y-8">
        <div
          role="tablist"
          aria-label="Event type"
          className="grid grid-cols-2 rounded-full bg-white/[0.08] p-1"
        >
          {(
            [
              ["tickets", "Sell tickets"],
              ["rsvp", "Free RSVP"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              role="tab"
              aria-selected={mode === v}
              onClick={() => setMode(v)}
              className={cn(
                "h-7 rounded-full text-sm font-medium transition-colors",
                mode === v ? "bg-white/[0.12] text-fg" : "text-fg/60 hover:text-fg",
              )}
            >
              {l}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="title" className="sr-only">
            Event title
          </label>
          <input
            id="title"
            value={title}
            maxLength={140}
            placeholder="My Event Name"
            autoComplete="off"
            onChange={(e) => {
              setTitle(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
            className="w-full bg-transparent font-display text-4xl font-medium placeholder:text-fg/40 focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-1 text-xs text-fg-muted">
            <span>project23 / events /</span>
            <label htmlFor="slug" className="sr-only">
              Event URL
            </label>
            <input
              id="slug"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
              placeholder="your-event"
              className="min-w-0 flex-1 bg-transparent text-fg focus:outline-none"
            />
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {!showSummary && (
              <button
                onClick={() => setShowSummary(true)}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-white/[0.08] px-3 text-sm font-medium hover:bg-white/[0.12]"
              >
                <Plus className="size-4" /> Short Summary
              </button>
            )}
          </div>
          {showSummary && (
            <div className={cn(row, "mt-4")}>
              <label htmlFor="summary" className="sr-only">
                Short summary
              </label>
              <input
                id="summary"
                autoFocus
                value={summary}
                maxLength={280}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="One line shown on cards and link previews"
                className={bare}
              />
            </div>
          )}
        </div>

        <Group icon={<CalendarDays />} title="Dates">
          <div className="overflow-hidden rounded-lg bg-white/[0.08]">
            <DateRow label="Start" value={start} onChange={setStart} id="start" />
            <div className="h-px bg-black/40" />
            <DateRow label="End" value={end} onChange={setEnd} id="end" />
          </div>
          <p className="px-1 text-xs text-fg-muted">Times are West Africa Time (WAT, UTC+1).</p>
        </Group>

        <Group icon={<AlignLeft />} title="Event Details">
          {showDesc ? (
            <div className="rounded-lg bg-white/[0.08] px-3">
              <label htmlFor="desc" className="sr-only">
                Description
              </label>
              <textarea
                id="desc"
                autoFocus
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What should people know? Line-up, dress code, what's included…"
                className={cn(bare, "resize-y")}
              />
            </div>
          ) : (
            <button
              onClick={() => setShowDesc(true)}
              className={cn(row, "w-full text-left hover:bg-white/[0.11]")}
            >
              <AlignLeft className="size-4" /> Add Description
            </button>
          )}
          <div className={row}>
            <Shapes className="size-4 shrink-0" />
            <label htmlFor="cat" className="shrink-0">
              Category
            </label>
            <select
              id="cat"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="ml-auto bg-transparent py-2 text-right text-sm focus:outline-none [&>option]:bg-zinc-900"
            >
              <option value="">Choose…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className={row}>
            <MapPin className="size-4 shrink-0" />
            <span className="shrink-0">Format</span>
            <div className="ml-auto flex gap-1">
              {(
                [
                  ["in_person", "In person"],
                  ["online", "Online"],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setFormat(v)}
                  aria-pressed={format === v}
                  className={cn(
                    "h-7 rounded-md px-2.5 text-xs font-medium",
                    format === v ? "bg-white/[0.16]" : "text-fg-muted hover:text-fg",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          {format === "in_person" && (
            <>
              <div className={row}>
                <MapPin className="size-4 shrink-0 opacity-0" />
                <label htmlFor="venue" className="sr-only">
                  Venue name
                </label>
                <input
                  id="venue"
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  placeholder="Venue Name"
                  className={bare}
                />
              </div>
              <div className={row}>
                <MapPin className="size-4 shrink-0 opacity-0" />
                <label htmlFor="addr" className="sr-only">
                  Address
                </label>
                <input
                  id="addr"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street address"
                  className={bare}
                />
              </div>
              <div className={row}>
                <MapPin className="size-4 shrink-0 opacity-0" />
                <label htmlFor="city" className="shrink-0">
                  City
                </label>
                <select
                  id="city"
                  value={cityId}
                  onChange={(e) => setCityId(e.target.value)}
                  className="ml-auto bg-transparent py-2 text-right text-sm focus:outline-none [&>option]:bg-zinc-900"
                >
                  <option value="">Choose…</option>
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div className={row}>
            <Users className="size-4 shrink-0" />
            <label htmlFor="cap" className="shrink-0">
              Capacity (people)
            </label>
            <input
              id="cap"
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
              className="ml-auto w-24 bg-transparent py-2 text-right text-sm focus:outline-none"
            />
          </div>
        </Group>

        <Group icon={<Ticket />} title={mode === "rsvp" ? "RSVP" : "Tickets"}>
          {(mode === "rsvp" ? tickets.slice(0, 1) : tickets).map((t, i) => (
            <div key={i} className="rounded-lg bg-white/[0.08] p-3">
              <div className="flex items-center gap-2">
                <label htmlFor={`tn-${i}`} className="sr-only">
                  Ticket name
                </label>
                <input
                  id={`tn-${i}`}
                  value={t.name}
                  onChange={(e) => updateTicket(i, { name: e.target.value })}
                  className="min-w-0 flex-1 bg-transparent text-base font-medium focus:outline-none"
                />
                {tickets.length > 1 && mode === "tickets" && (
                  <button
                    onClick={() => setTickets((ts) => ts.filter((_, k) => k !== i))}
                    aria-label={`Remove ${t.name}`}
                    className="text-fg-muted hover:text-fg"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-fg-muted">
                {mode === "tickets" && (
                  <label className="grid gap-1">
                    Price (₦)
                    <input
                      inputMode="decimal"
                      value={t.price}
                      onChange={(e) => updateTicket(i, { price: e.target.value })}
                      className={chip}
                    />
                  </label>
                )}
                <label className="grid gap-1">
                  Quantity
                  <input
                    type="number"
                    min={1}
                    value={t.quantity}
                    onChange={(e) => updateTicket(i, { quantity: Number(e.target.value) })}
                    className={chip}
                  />
                </label>
                {mode === "tickets" && (
                  <label className="grid gap-1">
                    Admits per ticket
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={t.admissionsPerUnit}
                      onChange={(e) =>
                        updateTicket(i, { admissionsPerUnit: Number(e.target.value) })
                      }
                      className={chip}
                    />
                  </label>
                )}
              </div>
            </div>
          ))}
          {mode === "tickets" && (
            <button
              onClick={() =>
                setTickets((ts) => [
                  ...ts,
                  {
                    name: ts.length === 1 ? "VIP" : `Ticket ${ts.length + 1}`,
                    price: "15000",
                    quantity: 50,
                    admissionsPerUnit: 1,
                  },
                ])
              }
              className="mx-auto flex size-9 items-center justify-center rounded-full hover:bg-white/[0.08]"
              aria-label="Add ticket type"
            >
              <Plus className="size-5" />
            </button>
          )}
          <p className="px-1 text-xs text-fg-muted">
            Early-bird windows, access codes, tables and dependencies can be set after creating.
          </p>
        </Group>

        <Group icon={<Settings2 />} title="Page Settings">
          <label className={cn(row, "cursor-pointer")}>
            <Eye className="size-4" /> Show on Explore
            <input
              type="checkbox"
              checked={explore}
              onChange={(e) => setExplore(e.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className="ml-auto flex h-5 w-9 items-center rounded-full bg-white/[0.15] p-0.5 transition-colors peer-checked:bg-white [&>span]:peer-checked:translate-x-4 [&>span]:peer-checked:bg-black"
            >
              <span className="size-4 rounded-full bg-white transition-transform" />
            </span>
          </label>
          <p className="px-1 text-xs text-fg-muted">
            Off = unlisted: only people with the link can find it.
          </p>
        </Group>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="space-y-3">
          <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-[#0d0d10] [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:24px_24px]">
            {preview && (
              // Local blob: preview of the file being uploaded; next/image can't optimise it.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="Cover preview"
                className="absolute inset-0 size-full object-cover"
              />
            )}
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                onClick={() => fileRef.current?.click()}
                className="inline-flex h-9 items-center gap-2 rounded-full bg-zinc-200 px-4 text-sm font-medium text-black shadow hover:bg-white"
              >
                <ImagePlus className="size-4" />{" "}
                {preview ? "Change cover image" : "Upload cover image"}
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="sr-only"
              aria-label="Cover image"
              onChange={(e) => pickCover(e.target.files?.[0])}
            />
          </div>
          <p className="text-center text-xs text-fg-muted">
            Portrait 4:5 flyer, max 5 MB. Without one we generate a typographic flyer.
          </p>
          {error && <Alert tone="danger">{error}</Alert>}
          <button
            onClick={submit}
            disabled={pending || !title.trim() || !categoryId}
            className="h-10 w-full rounded-full bg-[#3f3f46] text-base font-medium text-fg hover:bg-[#52525b] disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create Event"}
          </button>
          <p className="text-center text-xs text-fg-muted">
            Saved as a draft for {orgName}. Submit it for review when you&apos;re ready to go live.
          </p>
        </div>
      </aside>
    </div>
  );
}

function Group({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 border-t border-white/[0.06] pt-6">
      <h2 className="mb-3 flex items-center gap-2 text-base font-medium [&_svg]:size-4">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function DateRow({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  id: string;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 text-sm">
      <label htmlFor={id}>{label}</label>
      <span className="ml-auto text-xs text-fg-muted">WAT</span>
      <input
        id={id}
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={chip}
      />
    </div>
  );
}
