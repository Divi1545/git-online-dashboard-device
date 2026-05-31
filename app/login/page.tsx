'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    // Lazy import to avoid SSR instantiation without env vars
    const { createBrowserClient } = await import('@/lib/supabase/client')
    const supabase = createBrowserClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError(authError.message)
      setLoading(false)
    } else {
      router.refresh()
      router.push('/dashboard')
    }
  }, [email, password, router])

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-[#1A1A1A] border-white/10">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 bg-teal-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xl">K</span>
          </div>
          <CardTitle className="text-2xl font-bold text-white">Kiyanna AI</CardTitle>
          <p className="text-white/60 text-sm">Hardware Operator Dashboard</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="p-3 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm text-white/70">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@example.com"
                className="bg-[#111111] border-white/10 text-white placeholder:text-white/30"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/70">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-[#111111] border-white/10 text-white placeholder:text-white/30"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
