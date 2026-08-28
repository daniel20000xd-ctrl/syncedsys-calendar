// Env values pasted through dashboards sometimes carry a leading BOM or a
// trailing newline/whitespace. In an outbound HTTP header that throws (fetch
// rejects any code point > 255); in a secret comparison it just fails to match.
// Keep only printable ASCII -- API keys, URLs, JWTs, and our cron secret all
// live in that range.
export function cleanEnv(v: string | undefined): string {
  return Array.from(v ?? '')
    .filter((c) => {
      const n = c.charCodeAt(0)
      return n > 32 && n < 127
    })
    .join('')
}
