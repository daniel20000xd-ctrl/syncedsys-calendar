'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Calendar } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isPending, start] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    start(async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
      } else {
        router.push('/')
        router.refresh()
      }
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
      <div className="w-full max-w-sm mx-4">
        <div className="flex items-center gap-2 justify-center mb-8">
          <Calendar size={20} className="text-blue-500" />
          <span className="text-[#e8e8e8] font-semibold tracking-tight">Syncedsys Calendar</span>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#111] border border-[#242424] rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[#555] mb-1.5">Email</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-[#1a1a1a] border border-[#242424] rounded-lg px-3 py-2.5 text-sm text-[#e8e8e8] outline-none focus:border-blue-600 transition-colors placeholder-[#444]"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[#555] mb-1.5">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-[#1a1a1a] border border-[#242424] rounded-lg px-3 py-2.5 text-sm text-[#e8e8e8] outline-none focus:border-blue-600 transition-colors placeholder-[#444]"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={isPending}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {isPending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
