import "server-only";

/** Minimal responsive, branded email layout (tables + inline styles for client support). */
function esc(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export function layout(opts: {
  preheader: string;
  title: string;
  body: string;
  cta?: { label: string; url: string };
  footer?: string;
}) {
  const cta = opts.cta
    ? `<tr><td style="padding:8px 0 24px"><a href="${esc(opts.cta.url)}" style="display:inline-block;background:#f5a524;color:#111;font-weight:700;text-decoration:none;padding:14px 22px;border-radius:999px">${esc(opts.cta.label)}</a></td></tr>`
    : "";
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${esc(opts.title)}</title></head>
<body style="margin:0;background:#f4f2ee;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#141414">
<span style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden">
<tr><td style="background:#0c0c0e;padding:20px 28px"><span style="color:#f5a524;font-weight:800;letter-spacing:.08em;font-size:15px">PROJECT23</span></td></tr>
<tr><td style="padding:28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="font-size:22px;font-weight:700;line-height:1.3;padding-bottom:12px">${esc(opts.title)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;color:#333">${opts.body}</td></tr>
${cta}
</table></td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #eee;font-size:12px;color:#777;line-height:1.5">${opts.footer ?? "You received this email because of activity on Project23. Questions? Reply to the organizer or visit our help centre."}</td></tr>
</table></td></tr></table></body></html>`;
}

export function text(...lines: (string | null | undefined | false)[]) {
  return lines.filter(Boolean).join("\n");
}

export { esc };
