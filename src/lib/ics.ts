import type { Opportunity } from "./types";
import { CATEGORY_META } from "./format";

// ─────────────────────────────────────────────────────────────────────────────
// Calendar export — the student's own calendar becomes a zero-cost backup nudge.
// One-tap .ics (with VALARM at -1d and -3h) + a Google Calendar template URL.
// ─────────────────────────────────────────────────────────────────────────────

function toICSDate(iso: string): string {
  // YYYYMMDDTHHMMSSZ (UTC)
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function esc(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildICS(o: Opportunity): string {
  const dt = o.deadline ?? o.startDate;
  const start = dt ? toICSDate(dt) : toICSDate(new Date().toISOString());
  // 1-hour "deadline" block.
  const end = dt
    ? toICSDate(new Date(new Date(dt).getTime() + 3_600_000).toISOString())
    : start;
  const meta = CATEGORY_META[o.category];
  const summary = o.category === "event" ? `📅 ${o.title}` : `⏰ ${meta.singular} deadline: ${o.title}`;
  const desc = [
    `${meta.singular}${o.organization ? ` · ${o.organization}` : ""}`,
    o.summary ?? "",
    "",
    `Apply / details: ${o.sourceUrl}`,
    "",
    "Reminder by PATHROO.",
  ]
    .filter(Boolean)
    .join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PATHROO//Deadline//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${o.id}@PATHROO`,
    `DTSTAMP:${toICSDate(new Date().toISOString())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(desc)}`,
    `URL:${o.sourceUrl}`,
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(`1 day left — ${o.title}`)}`,
    "END:VALARM",
    "BEGIN:VALARM",
    "TRIGGER:-PT3H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(`3 hours left — ${o.title}`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

export function googleCalendarUrl(o: Opportunity): string {
  const dt = o.deadline ?? o.startDate;
  if (!dt) return o.sourceUrl;
  const start = toICSDate(dt);
  const end = toICSDate(new Date(new Date(dt).getTime() + 3_600_000).toISOString());
  const meta = CATEGORY_META[o.category];
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: o.category === "event" ? `📅 ${o.title}` : `⏰ ${meta.singular} deadline: ${o.title}`,
    dates: `${start}/${end}`,
    details: `${o.summary ?? ""}\n\nApply / details: ${o.sourceUrl}\n\nReminder by PATHROO.`,
    location: o.sourceUrl,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
