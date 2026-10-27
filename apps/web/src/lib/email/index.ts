import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Resend } from "resend";
import { env } from "../env";
import { adminClient } from "../supabase/admin";
import { logger } from "../log";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Buffer }[];
}

interface EmailAdapter {
  name: string;
  send(msg: EmailMessage, idempotencyKey: string): Promise<{ id: string }>;
}

/** Writes messages to .mail-capture/ at the repo root (viewable at /dev/mail in non-production). */
export const CAPTURE_DIR = path.resolve(process.cwd(), process.cwd().endsWith(path.join("apps", "web")) ? "../../.mail-capture" : ".mail-capture");

const captureAdapter: EmailAdapter = {
  name: "capture",
  async send(msg, key) {
    await mkdir(CAPTURE_DIR, { recursive: true });
    const id = `${Date.now()}-${key.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80)}`;
    await writeFile(path.join(CAPTURE_DIR, `${id}.json`), JSON.stringify({
      id, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text,
      attachments: (msg.attachments ?? []).map((a) => ({ filename: a.filename, bytes: a.content.length })), at: new Date().toISOString(),
    }, null, 2));
    return { id };
  },
};

function resendAdapter(): EmailAdapter {
  const client = new Resend(env().RESEND_API_KEY);
  return {
    name: "resend",
    async send(msg, key) {
      const { data, error } = await client.emails.send(
        { from: env().EMAIL_FROM, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text,
          attachments: msg.attachments?.map((a) => ({ filename: a.filename, content: a.content })) },
        { idempotencyKey: key },
      );
      if (error) throw new Error(`resend:${error.name}:${error.message}`);
      return { id: data!.id };
    },
  };
}

export function emailAdapter(): EmailAdapter {
  return env().EMAIL_PROVIDER === "resend" ? resendAdapter() : captureAdapter;
}

/**
 * Deduplicated delivery: an email_messages row is the delivery intent keyed by dedupeKey.
 * Already-sent intents are skipped, so job retries never send twice.
 */
export async function deliverEmail(dedupeKey: string, template: string, msg: EmailMessage, orderId?: string) {
  const db = adminClient();
  const log = logger({ scope: "email", template, dedupeKey });
  const { data, error } = await db.rpc("email_intent", {
    p_dedupe_key: dedupeKey, p_template: template, p_to: msg.to, p_subject: msg.subject, p_order: orderId,
  });
  if (error) throw error;
  const intent = data as { id: string; should_send: boolean };
  if (!intent.should_send) {
    log.info("email already sent; skipping");
    return { skipped: true };
  }
  const adapter = emailAdapter();
  try {
    const { id } = await adapter.send(msg, dedupeKey);
    await db.rpc("email_mark", { p_id: intent.id, p_status: "sent", p_provider: adapter.name, p_message_id: id });
    log.info("email sent", { provider: adapter.name });
    return { skipped: false };
  } catch (e) {
    await db.rpc("email_mark", { p_id: intent.id, p_status: "failed", p_provider: adapter.name, p_message_id: "", p_error: String(e) });
    throw e;
  }
}
