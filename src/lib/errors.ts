/** Converte erros do Supabase/Postgres em mensagens amigáveis em português. */
export function friendlyError(err: unknown): string {
  const e = err as { message?: string; code?: string } | null
  const msg = e?.message ?? String(err ?? 'Erro desconhecido')

  if (msg.includes('reservations_sem_sobreposicao') || e?.code === '23P01')
    return 'Este veículo já está reservado em parte desse período. Escolha outro horário.'
  if (msg.includes('reservations_periodo_valido'))
    return 'O horário de devolução precisa ser depois do horário de retirada.'
  if (msg.includes('row-level security'))
    return 'Você não tem permissão para esta ação.'
  if (msg.includes('Invalid login credentials'))
    return 'E-mail ou senha inválidos.'
  if (msg.includes('Email not confirmed'))
    return 'Seu acesso ainda não foi ativado. Use o link enviado por e-mail.'
  if (msg.includes('Password should be at least'))
    return 'A senha deve ter pelo menos 8 caracteres.'
  if (msg.includes('duplicate key') && msg.includes('plate'))
    return 'Já existe um veículo com esta placa.'
  if (msg.includes('Failed to fetch'))
    return 'Não foi possível conectar ao servidor. Verifique sua conexão.'
  return msg
}
