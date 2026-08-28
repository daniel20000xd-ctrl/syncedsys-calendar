import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

// supabase-js builds a RealtimeClient in its constructor; Node 20 has no global
// WebSocket. We never use realtime, but the reference must exist.
globalThis.WebSocket ??= WebSocket;

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TZ = process.env.CALENDAR_TZ || "UTC";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (expected from ../.env.local)."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let USER_ID = (process.env.CALENDAR_USER_ID || "").trim();
if (!USER_ID) {
  const email = (process.env.CALENDAR_USER_EMAIL || "").trim().toLowerCase();
  if (!email) {
    console.error(
      "Set CALENDAR_USER_ID or CALENDAR_USER_EMAIL in mcp/.env. Run `npm run whoami` to list users."
    );
    process.exit(1);
  }
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) {
    console.error("Could not resolve CALENDAR_USER_EMAIL:", error.message);
    process.exit(1);
  }
  const match = data.users.find((u) => u.email?.toLowerCase() === email);
  if (!match) {
    console.error(`No auth user with email ${email}. Run \`npm run whoami\`.`);
    process.exit(1);
  }
  USER_ID = match.id;
  console.error(`Resolved ${email} -> ${USER_ID}`);
}

const COLORS = ["blue", "green", "red", "yellow", "purple", "orange", "indigo"];
const OFFSET_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function text(body, isError = false) {
  return { content: [{ type: "text", text: body }], isError };
}

function fmt(iso) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TZ,
  }).format(new Date(iso));
}
function dayKey(iso) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  }).format(new Date(iso));
}
function clock(iso) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(iso));
}

const TOOLS = [
  {
    name: "add_event",
    description:
      "Create a calendar event together with one or more reminders. Every event must have at least one reminder. Timed events need ISO 8601 timestamps with an explicit timezone offset (e.g. 2026-09-01T14:00:00+02:00 or ...Z). For all_day events, pass start/end as a plain date (YYYY-MM-DD). Each reminder is either `minutes_before` (lead time) or `at` (absolute ISO time). Reminders whose trigger time is already in the past will not be sent.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Event title." },
        start: {
          type: "string",
          description:
            "Start. Timed: ISO 8601 with offset. all_day: YYYY-MM-DD.",
        },
        end: {
          type: "string",
          description:
            "Optional end, same format as start. Omit for an open-ended event.",
        },
        all_day: { type: "boolean", description: "Default false." },
        description: { type: "string", description: "Optional notes." },
        color: { type: "string", enum: COLORS },
        reminders: {
          type: "array",
          minItems: 1,
          description: "One or more reminders for this event.",
          items: {
            type: "object",
            properties: {
              minutes_before: {
                type: "integer",
                minimum: 0,
                description: "Lead time in minutes before the event start.",
              },
              at: {
                type: "string",
                description:
                  "Absolute reminder time, ISO 8601 with offset. Alternative to minutes_before.",
              },
              message: {
                type: "string",
                description: "Optional custom reminder message.",
              },
            },
          },
        },
      },
      required: ["title", "start", "reminders"],
    },
  },
  {
    name: "read_calendar",
    description:
      "Return the full calendar — every event with its reminders — as a date-grouped digest plus raw JSON, for discussion. By default returns the entire calendar (all past and future events).",
    inputSchema: {
      type: "object",
      properties: {
        from: {
          type: "string",
          description: "Optional lower bound on event start (ISO 8601).",
        },
        to: {
          type: "string",
          description: "Optional upper bound on event start (ISO 8601).",
        },
        upcoming_only: {
          type: "boolean",
          description:
            "If true and no `from` is given, start from the current time. Default false.",
        },
      },
    },
  },
];

async function addEvent(args = {}) {
  const { title, start, end, all_day = false, description, color, reminders } =
    args;
  const errs = [];

  if (typeof title !== "string" || !title.trim()) errs.push("title is required");

  if (typeof start !== "string") {
    errs.push("start is required");
  } else if (all_day && !DATE_RE.test(start)) {
    errs.push("for all_day events, start must be YYYY-MM-DD");
  } else if (!all_day && !OFFSET_RE.test(start)) {
    errs.push(
      "start must be ISO 8601 with a timezone offset, e.g. 2026-09-01T14:00:00+02:00"
    );
  }

  if (end != null) {
    if (all_day && !DATE_RE.test(end))
      errs.push("for all_day events, end must be YYYY-MM-DD");
    if (!all_day && !OFFSET_RE.test(end))
      errs.push("end must be ISO 8601 with a timezone offset");
  }

  if (color != null && !COLORS.includes(color))
    errs.push(`color must be one of: ${COLORS.join(", ")}`);

  if (!Array.isArray(reminders) || reminders.length === 0)
    errs.push("at least one reminder is required");

  if (errs.length) return text("Validation failed:\n- " + errs.join("\n- "), true);

  const startIso = all_day ? `${start}T00:00:00Z` : start;
  const startMs = new Date(startIso).getTime();
  if (Number.isNaN(startMs)) return text("start is not a valid date", true);

  const resolved = [];
  for (let i = 0; i < reminders.length; i++) {
    const r = reminders[i] ?? {};
    let mb;
    if (typeof r.minutes_before === "number") {
      mb = Math.round(r.minutes_before);
    } else if (typeof r.at === "string") {
      const atMs = new Date(r.at).getTime();
      if (Number.isNaN(atMs))
        return text(`reminders[${i}].at is not a valid date`, true);
      mb = Math.round((startMs - atMs) / 60000);
    } else {
      return text(`reminders[${i}] needs either minutes_before or at`, true);
    }
    if (mb < 0)
      return text(
        `reminders[${i}] resolves to ${mb} min before start — it would fire after the event begins`,
        true
      );
    const msg =
      typeof r.message === "string" && r.message.trim() ? r.message.trim() : null;
    resolved.push({ minutes_before: mb, custom_message: msg });
  }

  const { data: event, error: evErr } = await supabase
    .from("calendar_events")
    .insert({
      user_id: USER_ID,
      title: title.trim(),
      description:
        typeof description === "string" && description.trim()
          ? description.trim()
          : null,
      start_at: startIso,
      end_at: end == null ? null : all_day ? `${end}T00:00:00Z` : end,
      all_day: !!all_day,
      color: color ?? null,
    })
    .select()
    .single();

  if (evErr) return text("Failed to create event: " + evErr.message, true);

  const { data: rem, error: remErr } = await supabase
    .from("calendar_reminders")
    .insert(
      resolved.map((r) => ({
        ...r,
        event_id: event.id,
        user_id: USER_ID,
      }))
    )
    .select();

  if (remErr) {
    await supabase
      .from("calendar_events")
      .delete()
      .eq("id", event.id)
      .eq("user_id", USER_ID);
    return text(
      "Failed to create reminders (event rolled back): " + remErr.message,
      true
    );
  }

  const now = Date.now();
  const warnings = resolved
    .filter((r) => startMs - r.minutes_before * 60000 <= now)
    .map(
      (r) =>
        `reminder ${r.minutes_before} min before has a trigger time in the past — the reminder cron only sends future reminders, so it will not fire`
    );

  const lines = [
    `Created "${event.title}"  (id ${event.id})`,
    `  start: ${fmt(event.start_at)}${
      event.end_at ? `\n  end:   ${fmt(event.end_at)}` : "  (no end)"
    }`,
    event.all_day ? "  all day" : null,
    event.description ? `  note:  ${event.description}` : null,
    `  reminders: ${rem
      .map(
        (r) =>
          `${r.minutes_before} min before${
            r.custom_message ? ` ("${r.custom_message}")` : ""
          }`
      )
      .join(", ")}`,
    ...warnings.map((w) => "  WARNING: " + w),
  ].filter(Boolean);

  return text(lines.join("\n"));
}

async function readCalendar(args = {}) {
  const { from, to, upcoming_only = false } = args;

  let q = supabase
    .from("calendar_events")
    .select("*")
    .eq("user_id", USER_ID)
    .order("start_at", { ascending: true });

  const lower = from ?? (upcoming_only ? new Date().toISOString() : null);
  if (lower) q = q.gte("start_at", lower);
  if (to) q = q.lte("start_at", to);

  const { data: events, error } = await q;
  if (error) return text("Failed to read calendar: " + error.message, true);

  const { data: allReminders, error: remErr } = await supabase
    .from("calendar_reminders")
    .select("*")
    .eq("user_id", USER_ID);
  if (remErr) return text("Failed to read reminders: " + remErr.message, true);

  const byEvent = new Map();
  for (const r of allReminders ?? []) {
    if (!byEvent.has(r.event_id)) byEvent.set(r.event_id, []);
    byEvent.get(r.event_id).push(r);
  }

  if (!events || events.length === 0)
    return text("Calendar is empty for the requested range.");

  const groups = new Map();
  for (const ev of events) {
    const key = ev.all_day
      ? dayKey(ev.start_at) + "  (all day)"
      : dayKey(ev.start_at);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ev);
  }

  const header = `Calendar — ${events.length} event${
    events.length === 1 ? "" : "s"
  }${lower ? `, from ${fmt(lower)}` : ""}${
    to ? `, to ${fmt(to)}` : ""
  }. Times shown in ${TZ}.`;

  const out = [header];
  for (const [key, evs] of groups) {
    out.push("", key);
    for (const ev of evs) {
      const rem = (byEvent.get(ev.id) ?? []).sort(
        (a, b) => b.minutes_before - a.minutes_before
      );
      const when = ev.all_day
        ? "all day"
        : `${clock(ev.start_at)}${ev.end_at ? `-${clock(ev.end_at)}` : ""}`;
      out.push(
        `  - ${when}  ${ev.title}${
          ev.description ? ` -- ${ev.description}` : ""
        }`
      );
      if (rem.length)
        out.push(
          `      reminders: ${rem
            .map(
              (r) =>
                `${r.minutes_before}m${r.sent_at ? " (sent)" : ""}${
                  r.custom_message ? ` "${r.custom_message}"` : ""
                }`
            )
            .join(", ")}`
        );
    }
  }

  const raw = events.map((ev) => ({
    ...ev,
    reminders: byEvent.get(ev.id) ?? [],
  }));
  out.push("", "```json", JSON.stringify(raw, null, 2), "```");

  return text(out.join("\n"));
}

const server = new Server(
  { name: "syncedsys-calendar", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    if (name === "add_event") return await addEvent(args);
    if (name === "read_calendar") return await readCalendar(args);
    return text(`Unknown tool: ${name}`, true);
  } catch (e) {
    return text(`Error: ${e?.message ?? String(e)}`, true);
  }
});

await server.connect(new StdioServerTransport());
console.error(`syncedsys-calendar MCP on stdio (user ${USER_ID}, tz ${TZ})`);
