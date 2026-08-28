import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

globalThis.WebSocket ??= WebSocket;

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (expected from ../.env.local).");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
if (error) {
  console.error(error.message);
  process.exit(1);
}

for (const u of data.users) {
  console.log(`${u.id}\t${u.email ?? "(no email)"}\t${u.created_at}`);
}
