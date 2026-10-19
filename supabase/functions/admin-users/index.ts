// Edge Function: operações administrativas de usuários que exigem a service role.
//  - invite:     cadastra o usuário e envia e-mail de convite para criar senha
//  - set_active: ativa/desativa o acesso (bloqueia login no Auth)
//
// Deploy: supabase functions deploy admin-users
// Secrets: SITE_URL (URL pública do sistema, ex.: https://demarco.github.io/reserva-veiculos/)

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SITE_URL = Deno.env.get('SITE_URL') ?? undefined

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  // 1) Identifica quem está chamando
  const authHeader = req.headers.get('Authorization') ?? ''
  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userErr } = await caller.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Não autenticado' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // 2) Confere se é administrador ativo
  const { data: me } = await admin.from('profiles').select('role, active').eq('id', userData.user.id).maybeSingle()
  if (!me || me.role !== 'admin' || !me.active) return json({ error: 'Apenas administradores podem executar esta ação.' }, 403)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON inválido' }, 400)
  }

  switch (body.action) {
    case 'invite': {
      const email = String(body.email ?? '').trim().toLowerCase()
      const fullName = String(body.full_name ?? '').trim()
      const department = body.department ? String(body.department).trim() : null
      const role = body.role === 'admin' ? 'admin' : 'user'
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'E-mail inválido.' }, 400)
      if (!fullName) return json({ error: 'Informe o nome.' }, 400)

      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName, department },
        redirectTo: SITE_URL,
      })
      if (error) {
        const msg = /already been registered|already exists/i.test(error.message)
          ? 'Este e-mail já está cadastrado. Use "Enviar acesso" na lista para reenviar o link.'
          : error.message
        return json({ error: msg }, 400)
      }

      // O trigger handle_new_user cria o perfil; aqui só ajustamos papel e dados.
      await admin
        .from('profiles')
        .upsert({ id: data.user.id, email, full_name: fullName, department, role, active: true })

      return json({ ok: true, user_id: data.user.id })
    }

    case 'set_active': {
      const userId = String(body.user_id ?? '')
      const active = Boolean(body.active)
      if (!userId) return json({ error: 'user_id obrigatório' }, 400)
      if (userId === userData.user.id) return json({ error: 'Você não pode desativar a si mesmo.' }, 400)

      const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: active ? 'none' : '876000h', // ~100 anos
      })
      if (banErr) return json({ error: banErr.message }, 400)

      const { error } = await admin.from('profiles').update({ active }).eq('id', userId)
      if (error) return json({ error: error.message }, 400)

      // Ao desativar, cancela as reservas futuras do usuário
      if (!active) {
        await admin
          .from('reservations')
          .update({ status: 'cancelada', cancelled_at: new Date().toISOString(), cancelled_by: userData.user.id })
          .eq('user_id', userId)
          .eq('status', 'confirmada')
          .gt('starts_at', new Date().toISOString())
      }
      return json({ ok: true })
    }

    default:
      return json({ error: 'Ação desconhecida' }, 400)
  }
})
