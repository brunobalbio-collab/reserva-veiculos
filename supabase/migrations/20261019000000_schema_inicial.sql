-- =====================================================================
-- Reserva de Veículos - Frota Compartilhada
-- Schema inicial (Supabase / PostgreSQL)
-- =====================================================================

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- Perfis de usuário (1:1 com auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  email       text not null,
  department  text,
  phone       text,
  role        text not null default 'user' check (role in ('user', 'admin')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.profiles is 'Usuários cadastrados no sistema de reservas.';

-- ---------------------------------------------------------------------
-- Veículos
-- ---------------------------------------------------------------------
create table public.vehicles (
  id          uuid primary key default gen_random_uuid(),
  plate       text not null unique,
  brand       text not null,
  model       text not null,
  color       text,
  year        int,
  seats       int default 5,
  location    text,               -- unidade / local de retirada
  notes       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Configurações gerais (linha única)
-- ---------------------------------------------------------------------
create table public.settings (
  id                    int primary key default 1 check (id = 1),
  max_duration_hours    int not null default 72,   -- duração máxima de uma reserva
  max_advance_days      int not null default 60,   -- antecedência máxima
  min_interval_minutes  int not null default 0     -- intervalo mínimo entre reservas (limpeza/abastecimento)
);
insert into public.settings (id) values (1);

-- ---------------------------------------------------------------------
-- Reservas
-- ---------------------------------------------------------------------
create table public.reservations (
  id                uuid primary key default gen_random_uuid(),
  vehicle_id        uuid not null references public.vehicles (id) on delete restrict,
  user_id           uuid not null references public.profiles (id) on delete restrict,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  kind              text not null default 'reserva' check (kind in ('reserva', 'manutencao')),
  status            text not null default 'confirmada' check (status in ('confirmada', 'cancelada')),
  destination       text,
  purpose           text,
  passengers        int,
  cancelled_at      timestamptz,
  cancelled_by      uuid references public.profiles (id),
  reminder_sent_at  timestamptz,
  created_at        timestamptz not null default now(),

  constraint reservations_periodo_valido check (ends_at > starts_at),

  -- Impede, no nível do banco, duas reservas confirmadas sobrepostas no mesmo veículo.
  constraint reservations_sem_sobreposicao exclude using gist (
    vehicle_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'confirmada')
);

create index reservations_user_idx    on public.reservations (user_id, starts_at desc);
create index reservations_vehicle_idx on public.reservations (vehicle_id, starts_at);

-- =====================================================================
-- Funções auxiliares
-- =====================================================================

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

-- Cria o perfil automaticamente quando um usuário é criado/convidado no Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- O papel é sempre 'user' aqui; promoção a admin é feita pelo painel (Edge Function).
  insert into public.profiles (id, email, full_name, department)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'department'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Validações de negócio na criação/alteração de reservas
create or replace function public.validate_reservation()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  cfg public.settings;
  v_active boolean;
  v_conflict int;
begin
  select * into cfg from public.settings where id = 1;

  if new.status = 'confirmada' then
    select active into v_active from public.vehicles where id = new.vehicle_id;
    if not coalesce(v_active, false) and new.kind = 'reserva' then
      raise exception 'Veículo indisponível para reservas.' using errcode = 'P0001';
    end if;

    if new.kind = 'reserva' and not public.is_admin() then
      if tg_op = 'INSERT' and new.starts_at < now() - interval '5 minutes' then
        raise exception 'Não é possível reservar no passado.' using errcode = 'P0001';
      end if;
      if new.ends_at - new.starts_at > make_interval(hours => cfg.max_duration_hours) then
        raise exception 'A reserva excede a duração máxima de % horas.', cfg.max_duration_hours using errcode = 'P0001';
      end if;
      if new.starts_at > now() + make_interval(days => cfg.max_advance_days) then
        raise exception 'Reservas só podem ser feitas com até % dias de antecedência.', cfg.max_advance_days using errcode = 'P0001';
      end if;
    end if;

    -- Intervalo mínimo entre reservas (opcional)
    if cfg.min_interval_minutes > 0 then
      select count(*) into v_conflict
      from public.reservations r
      where r.vehicle_id = new.vehicle_id
        and r.status = 'confirmada'
        and r.id <> new.id
        and tstzrange(r.starts_at - make_interval(mins => cfg.min_interval_minutes),
                      r.ends_at   + make_interval(mins => cfg.min_interval_minutes), '[)')
            && tstzrange(new.starts_at, new.ends_at, '[)');
      if v_conflict > 0 then
        raise exception 'É necessário um intervalo de % minutos entre reservas deste veículo.', cfg.min_interval_minutes using errcode = 'P0001';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger reservations_validate
  before insert or update on public.reservations
  for each row execute function public.validate_reservation();

-- Agenda de ocupação de um veículo (sem expor dados pessoais de outros usuários)
create or replace function public.vehicle_schedule(
  p_vehicle_id uuid,
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  id          uuid,
  starts_at   timestamptz,
  ends_at     timestamptz,
  kind        text,
  is_mine     boolean,
  user_name   text
)
language sql stable security definer set search_path = public
as $$
  select r.id, r.starts_at, r.ends_at, r.kind,
         r.user_id = auth.uid() as is_mine,
         case when r.user_id = auth.uid() or public.is_admin() then p.full_name else null end
  from public.reservations r
  join public.profiles p on p.id = r.user_id
  where public.is_active_user()
    and r.vehicle_id = p_vehicle_id
    and r.status = 'confirmada'
    and r.starts_at < p_to
    and r.ends_at   > p_from
  order by r.starts_at;
$$;

-- Veículos livres em um período
create or replace function public.available_vehicles(p_from timestamptz, p_to timestamptz)
returns setof public.vehicles
language sql stable security definer set search_path = public
as $$
  select v.* from public.vehicles v
  where public.is_active_user()
    and v.active
    and not exists (
      select 1 from public.reservations r
      where r.vehicle_id = v.id
        and r.status = 'confirmada'
        and tstzrange(r.starts_at, r.ends_at, '[)') && tstzrange(p_from, p_to, '[)')
    )
  order by v.model;
$$;

-- Cancelamento (o usuário só cancela as próprias reservas futuras; admin cancela qualquer uma)
create or replace function public.cancel_reservation(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r public.reservations;
begin
  select * into r from public.reservations where id = p_id for update;
  if not found then
    raise exception 'Reserva não encontrada.' using errcode = 'P0001';
  end if;
  if r.user_id <> auth.uid() and not public.is_admin() then
    raise exception 'Você não pode cancelar esta reserva.' using errcode = 'P0001';
  end if;
  if r.status = 'cancelada' then
    return;
  end if;
  if r.ends_at < now() and not public.is_admin() then
    raise exception 'Não é possível cancelar uma reserva já encerrada.' using errcode = 'P0001';
  end if;

  update public.reservations
     set status = 'cancelada', cancelled_at = now(), cancelled_by = auth.uid()
   where id = p_id;
end;
$$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles     enable row level security;
alter table public.vehicles     enable row level security;
alter table public.reservations enable row level security;
alter table public.settings     enable row level security;

-- PROFILES
create policy "perfil: ver o próprio ou admin vê todos" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

create policy "perfil: usuário edita dados básicos" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Usuário comum não pode alterar o próprio papel, status ou e-mail
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role   := old.role;
    new.active := old.active;
    new.email  := old.email;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

create policy "perfil: admin edita todos" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- VEHICLES
create policy "veículos: usuários ativos leem" on public.vehicles
  for select using (public.is_active_user());

create policy "veículos: admin gerencia" on public.vehicles
  for all using (public.is_admin()) with check (public.is_admin());

-- SETTINGS
create policy "config: usuários ativos leem" on public.settings
  for select using (public.is_active_user());

create policy "config: admin altera" on public.settings
  for update using (public.is_admin()) with check (public.is_admin());

-- RESERVATIONS
create policy "reservas: ver as próprias ou admin vê todas" on public.reservations
  for select using (user_id = auth.uid() or public.is_admin());

create policy "reservas: usuário ativo cria as próprias" on public.reservations
  for insert with check (
    public.is_active_user()
    and user_id = auth.uid()
    and status = 'confirmada'
    and (kind = 'reserva' or public.is_admin())
  );

create policy "reservas: admin gerencia" on public.reservations
  for all using (public.is_admin()) with check (public.is_admin());

-- Usuários comuns cancelam via função cancel_reservation(); não há UPDATE direto.

grant execute on function public.vehicle_schedule(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.available_vehicles(timestamptz, timestamptz)    to authenticated;
grant execute on function public.cancel_reservation(uuid)                        to authenticated;
