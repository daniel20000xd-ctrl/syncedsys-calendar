import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Calendar from '@/components/Calendar'

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="h-screen">
      <Calendar />
    </div>
  )
}
