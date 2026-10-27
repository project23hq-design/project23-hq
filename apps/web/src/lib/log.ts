import "server-only";
import { randomUUID } from "node:crypto";

type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const REDACT = /(secret|password|token|authorization|signature|account_number|qr)/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => scrub(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      REDACT.test(k) ? "[redacted]" : scrub(v, depth + 1),
    ]),
  );
}

/** Structured JSON logs with a correlation id; secrets and credential-like keys are redacted. */
export function logger(context: Record<string, unknown> = {}) {
  const correlationId = (context.correlationId as string) ?? randomUUID();
  const min = order[(process.env.LOG_LEVEL as Level) ?? "info"] ?? 20;
  const emit = (level: Level, msg: string, data?: Record<string, unknown>) => {
    if (order[level] < min) return;
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      msg,
      correlationId,
      ...(scrub({ ...context, ...data }) as object),
    });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.info(line);
  };
  return {
    correlationId,
    child: (extra: Record<string, unknown>) => logger({ ...context, ...extra, correlationId }),
    debug: (m: string, d?: Record<string, unknown>) => emit("debug", m, d),
    info: (m: string, d?: Record<string, unknown>) => emit("info", m, d),
    warn: (m: string, d?: Record<string, unknown>) => emit("warn", m, d),
    error: (m: string, d?: Record<string, unknown>) => emit("error", m, d),
  };
}
