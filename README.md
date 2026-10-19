# Reserva de Veículos – Frota Compartilhada

Sistema web para reserva online dos veículos leves da frota compartilhada.
Cada usuário cadastrado entra com seu e-mail e senha, vê a agenda de cada veículo (dias e horários livres/ocupados) e reserva com retirada e devolução livres. O banco impede reservas sobrepostas.

**Stack:** React + Vite + TypeScript (front, publicado no GitHub Pages) · Supabase (Postgres, Auth, Edge Functions) · Resend (e-mails).

## Funcionalidades

**Usuário**
- Login por e-mail/senha (contas criadas pelo administrador; o usuário define a própria senha pelo link do convite)
- Agenda semanal por veículo: livre / reservado / sua reserva / manutenção
- Clique no horário livre → formulário já preenchido; aviso de conflito em tempo real
- "Encontrar veículo livre": informa período e vê só os veículos disponíveis
- Minhas reservas (próximas e histórico) com cancelamento
- E-mails de confirmação (com convite .ics para o calendário), cancelamento e lembrete 1h antes

**Administrador**
- Veículos: cadastrar, editar, ativar/desativar
- Usuários: cadastrar (envia convite), reenviar acesso, tornar admin, desativar (bloqueia login e cancela reservas futuras)
- Todas as reservas com filtros, cancelamento e exportação CSV (abre no Excel)
- Bloqueio de veículo para manutenção
- Regras: duração máxima, antecedência máxima, intervalo mínimo entre reservas

**Segurança:** Row Level Security em todas as tabelas. Usuários comuns só veem as próprias reservas; na agenda, horários de terceiros aparecem como "Reservado" sem expor nome. A sobreposição é bloqueada por *exclusion constraint* no Postgres, então duas pessoas clicando ao mesmo tempo não conseguem reservar o mesmo horário.

---

## Implantação passo a passo

### 1. Supabase
1. Crie um projeto em <https://supabase.com> (região **South America (São Paulo)**).
2. **SQL Editor** → cole e execute `supabase/migrations/20261019000000_schema_inicial.sql`.
3. (Opcional) execute `supabase/seed_exemplo.sql` para criar veículos de exemplo.
4. **Authentication → Sign In / Providers → Email**: **desative "Allow new users to sign up"** (só o admin cadastra).
5. **Authentication → URL Configuration**:
   - *Site URL*: `https://<org>.github.io/<repositorio>/` (com a barra final)
   - *Redirect URLs*: adicione a mesma URL e `http://localhost:5173/`
6. **Authentication → Email Templates**: substitua os templates **Invite user** e **Reset password** pelo conteúdo de `supabase/templates/convite.html` e `supabase/templates/recuperacao.html`.
7. **Primeiro administrador**: Authentication → Users → *Add user* → *Create new user* (marque *Auto confirm*). Depois, no SQL Editor:
   ```sql
   update public.profiles set role = 'admin', full_name = 'Seu Nome'
   where email = 'seu.email@empresa.com.br';
   ```

> **E-mails do Auth (convite/senha):** o servidor padrão do Supabase tem limite baixo de envios. Para produção configure SMTP próprio em *Project Settings → Authentication → SMTP* (pode ser o próprio Resend: `smtp.resend.com`, porta 465, usuário `resend`, senha = API key).

### 2. Edge Functions e notificações
Instale o [Supabase CLI](https://supabase.com/docs/guides/cli) e, na pasta do projeto:

```bash
supabase login
supabase link --project-ref <PROJECT_REF>

supabase secrets set \
  SITE_URL="https://<org>.github.io/<repositorio>/" \
  RESEND_API_KEY="re_xxx" \
  EMAIL_FROM="Reserva de Veículos <frota@seudominio.com.br>" \
  WEBHOOK_SECRET="$(openssl rand -hex 24)" \
  APP_NAME="Reserva de Veículos"
# opcionais: ADMIN_NOTIFY_EMAIL (cópia oculta de todas as notificações), REMINDER_MINUTES (padrão 60)

supabase functions deploy admin-users
supabase functions deploy notify-reservation --no-verify-jwt
```

Depois edite `supabase/setup_notificacoes.sql` (coloque o PROJECT_REF e o mesmo valor de `WEBHOOK_SECRET`) e execute no SQL Editor. Isso cria o gatilho que envia e-mail a cada reserva/cancelamento e o agendamento de lembretes (pg_cron, a cada 15 min).

Resend: crie conta em <https://resend.com>, verifique o domínio do remetente e gere a API key. Sem `RESEND_API_KEY`, o sistema funciona normalmente, só não envia e-mails de reserva.

### 3. GitHub
1. Crie o repositório e envie o código:
   ```bash
   git remote add origin https://github.com/<org>/<repositorio>.git
   git push -u origin main
   ```
2. **Settings → Pages → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → Variables**, crie:
   | Variável | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://<PROJECT_REF>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | chave *anon/publishable* (é pública; a proteção é o RLS) |
   | `VITE_APP_NAME` | opcional, ex.: `Reserva de Veículos` |
   | `VITE_COMPANY_NAME` | opcional, ex.: `Citrosuco · Frota Compartilhada` |
4. A cada push na `main` o workflow **Deploy – GitHub Pages** publica o site.

Opcional: o workflow manual **Deploy – Supabase** aplica migrações e publica as funções. Ele precisa dos secrets `SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD` e da variável `SUPABASE_PROJECT_REF`.

> **Repositório privado:** GitHub Pages em repositório privado exige plano GitHub Team/Enterprise. Alternativa sem custo: Vercel, Netlify ou Cloudflare Pages conectados ao mesmo repositório (build `npm run build`, pasta `dist`).

---

## Desenvolvimento local
```bash
cp .env.example .env.local   # preencha URL e anon key
npm install
npm run dev                  # http://localhost:5173
```

## Estrutura
```
src/
  pages/Reservar.tsx          agenda semanal + formulário de reserva
  pages/MinhasReservas.tsx
  pages/admin/                reservas, veículos, usuários, configurações
  components/WeekSchedule.tsx grade semanal de disponibilidade
  lib/                        cliente Supabase, autenticação, formatação
supabase/
  migrations/                 schema, RLS, regras de negócio
  functions/admin-users/      convite e ativação de usuários (service role)
  functions/notify-reservation/ e-mails (confirmação, cancelamento, lembrete)
  setup_notificacoes.sql      gatilho pg_net + pg_cron
  templates/                  e-mails de convite e redefinição de senha
```

## Próximos passos sugeridos
- Login com conta Microsoft (Entra ID) – o Supabase suporta Azure como provedor
- Check-out/check-in com km e fotos
- Aprovação de gestor para reservas longas
- Relatório de utilização por veículo/área
