import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, EmailOtpType } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Profile } from './types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  /** Definido quando o usuário chegou por link de convite/recuperação e precisa criar senha */
  mustSetPassword: boolean
  linkError: string | null
  refreshProfile: () => Promise<void>
  clearMustSetPassword: () => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

/**
 * Os e-mails de convite e recuperação apontam para:
 *   <site>/?token_hash=...&type=invite|recovery
 * Aqui trocamos o token por uma sessão e limpamos a URL.
 */
async function consumeEmailLink(): Promise<{ handled: boolean; error?: string }> {
  const params = new URLSearchParams(window.location.search)
  const tokenHash = params.get('token_hash')
  const type = params.get('type') as EmailOtpType | null
  if (!tokenHash || !type) return { handled: false }

  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
  const clean = window.location.pathname + '#/definir-senha'
  window.history.replaceState(null, '', clean)
  if (error) return { handled: true, error: 'Link inválido ou expirado. Peça um novo link ao administrador ou use "Esqueci minha senha".' }
  return { handled: true }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [mustSetPassword, setMustSetPassword] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  async function loadProfile(userId: string | undefined) {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    setProfile((data as Profile) ?? null)
  }

  useEffect(() => {
    let mounted = true

    ;(async () => {
      const link = await consumeEmailLink()
      if (link.handled) {
        if (link.error) setLinkError(link.error)
        else setMustSetPassword(true)
      }
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      setSession(data.session)
      await loadProfile(data.session?.user.id)
      if (mounted) setLoading(false)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setMustSetPassword(true)
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'SIGNED_OUT') {
        // Evita chamadas ao Supabase dentro do callback (recomendação da lib)
        setTimeout(() => loadProfile(s?.user.id), 0)
      }
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value: AuthState = {
    session,
    profile,
    loading,
    mustSetPassword,
    linkError,
    refreshProfile: () => loadProfile(session?.user.id),
    clearMustSetPassword: () => setMustSetPassword(false),
    signOut: async () => {
      await supabase.auth.signOut()
      setProfile(null)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
