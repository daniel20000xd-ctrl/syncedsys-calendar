# syncedsys-calendar MCP

Local stdio MCP server that lets Claude **read** the whole calendar and **add**
events (each with one or more reminders). Edits and deletions are intentionally
not exposed — do those yourself in the app.

## How it works

- Talks straight to Supabase with the **service-role key**, scoped to a single
  `user_id`. No RLS in play — keep this local.
- Reuses `../.env.local` for `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, so no
  secret is duplicated into any MCP config.
- Reminders are written as `calendar_reminders` rows (`sent_at` null). The hub
  cron `app/api/cron/calendar-reminders` picks them up and emails them, firing at
  `start_at − minutes_before`. It only sends reminders whose trigger is still in
  the future — `add_event` warns when a reminder you asked for is already past.

## Setup

```bash
cd A:\Projects\syncedsys-calendar\mcp
npm install
cp .env.example .env        # already created; edit if needed
npm run whoami              # lists auth users -> confirm your id/email
npm start                   # smoke test: should print "syncedsys-calendar MCP on stdio ..."
```

`.env` holds only `CALENDAR_USER_EMAIL` (resolved to an id at startup) and
`CALENDAR_TZ` (used only for formatting the `read_calendar` digest). Pin
`CALENDAR_USER_ID` instead of the email to skip the startup lookup.

## Wire into a client

### Claude Code

`../.mcp.json` (repo root) already defines it — trust the server when Claude Code
prompts, or add it user-scoped:

```bash
claude mcp add syncedsys-calendar -- node --env-file=A:\Projects\syncedsys-calendar\.env.local --env-file=A:\Projects\syncedsys-calendar\mcp\.env A:\Projects\syncedsys-calendar\mcp\server.mjs
```

### Claude Desktop

Add to `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "syncedsys-calendar": {
      "command": "node",
      "args": [
        "--env-file=A:\\Projects\\syncedsys-calendar\\.env.local",
        "--env-file=A:\\Projects\\syncedsys-calendar\\mcp\\.env",
        "A:\\Projects\\syncedsys-calendar\\mcp\\server.mjs"
      ]
    }
  }
}
```

Restart Claude Desktop afterwards.

## Tools

### `read_calendar`

Returns every event with its reminders as a date-grouped digest plus a raw JSON
block. Optional `from` / `to` (ISO 8601) bound the event start; `upcoming_only`
starts from now when no `from` is given. No args = the entire calendar.

### `add_event`

| field | required | notes |
|-------|----------|-------|
| `title` | yes | |
| `start` | yes | timed: ISO 8601 **with offset** (`2026-09-01T14:00:00+02:00` or `...Z`); all_day: `YYYY-MM-DD` |
| `end` | no | same format as `start`; omit for open-ended |
| `all_day` | no | default false |
| `description` | no | |
| `color` | no | `blue` `green` `red` `yellow` `purple` `orange` `indigo` |
| `reminders` | yes, ≥1 | each item: `minutes_before` (int ≥ 0) **or** `at` (absolute ISO w/ offset), plus optional `message` |

The event and its reminders are created together; if the reminder insert fails
the event is rolled back.
