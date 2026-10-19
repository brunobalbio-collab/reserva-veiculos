-- =====================================================================
-- Notificações por e-mail (executar UMA vez no SQL Editor do Supabase,
-- depois de publicar a Edge Function notify-reservation).
--
-- Substitua os 2 valores marcados com <<< >>> antes de executar.
-- =====================================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- 1) Guarda URL da função e segredo no Vault (criptografado)
select vault.create_secret(
  'https://<<<PROJECT_REF>>>.supabase.co/functions/v1/notify-reservation',
  'notify_url', 'URL da Edge Function de notificações'
);
select vault.create_secret(
  '<<<MESMO_VALOR_DO_SECRET_WEBHOOK_SECRET>>>',
  'notify_secret', 'Segredo compartilhado com a Edge Function'
);

-- 2) Função que chama a Edge Function de forma assíncrona (não bloqueia a reserva)
create or replace function public.call_notify(payload jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'notify_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret';
  if v_url is null then
    return;
  end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    body    := payload
  );
end;
$$;

revoke execute on function public.call_notify(jsonb) from public, anon, authenticated;

create or replace function public.notify_reservation_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.kind <> 'reserva' then
    return new;
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.status is distinct from new.status) then
    perform public.call_notify(jsonb_build_object(
      'type', tg_op,
      'record', to_jsonb(new),
      'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) end
    ));
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_notify on public.reservations;
create trigger reservations_notify
  after insert or update of status on public.reservations
  for each row execute function public.notify_reservation_change();

-- 3) Lembrete automático (a cada 15 minutos verifica reservas que começam na próxima hora)
select cron.schedule(
  'lembrete-reservas',
  '*/15 * * * *',
  $$ select public.call_notify('{"type":"reminder"}'::jsonb) $$
);
