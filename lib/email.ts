import { Resend } from 'resend'

const FROM = 'Syncedsys Calendar <calendar@syncedsys.com>'

let _resend: Resend | null = null
function resend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('RESEND_API_KEY not configured')
    _resend = new Resend(key)
  }
  return _resend
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

export async function sendReminderEmail(
  to: string,
  event: { title: string; start_at: string; end_at: string | null; description: string | null },
  minutesBefore: number,
  customMessage?: string,
) {
  const when = minutesBefore >= 1440
    ? 'tomorrow'
    : minutesBefore >= 60
    ? `in ${minutesBefore / 60} hour${minutesBefore / 60 === 1 ? '' : 's'}`
    : `in ${minutesBefore} minute${minutesBefore === 1 ? '' : 's'}`

  const subject = `Reminder: ${event.title} ${when}`

  const html = customMessage
    ? `<p>${customMessage}</p>`
    : `<p>${[
        `<b>${event.title}</b>`,
        `<br>Start: ${fmtTime(event.start_at)}`,
        event.end_at ? `<br>End: ${fmtTime(event.end_at)}` : '',
        event.description ? `<br><br>${event.description}` : '',
      ].filter(Boolean).join('')}</p>`

  await resend().emails.send({ from: FROM, to, subject, html })
}
