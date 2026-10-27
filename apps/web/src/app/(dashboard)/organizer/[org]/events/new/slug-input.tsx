"use client";
import { useState } from "react";
import { slugify } from "@project23/domain";
import { Field, Input } from "@project23/ui";

export function SlugInput({ title = "", slug = "" }: { title?: string; slug?: string }) {
  const [t, setT] = useState(title);
  const [s, setS] = useState(slug);
  const [touched, setTouched] = useState(!!slug);
  return (
    <>
      <Field label="Event title" htmlFor="title" required>
        <Input
          name="title"
          value={t}
          maxLength={140}
          onChange={(e) => {
            setT(e.target.value);
            if (!touched) setS(slugify(e.target.value));
          }}
        />
      </Field>
      <Field label="Event URL" htmlFor="slug" required hint={`/events/${s || "your-event"}`}>
        <Input
          name="slug"
          value={s}
          onChange={(e) => {
            setTouched(true);
            setS(slugify(e.target.value));
          }}
        />
      </Field>
    </>
  );
}
