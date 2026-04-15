# Jean Izidoro — Landing + CRM com IA

Site institucional + painel administrativo com:
- Landing premium (GSAP, Lenis, parallax cinematográfico)
- Login restrito em `/auth`
- Painel CRM em `/app` (protegido)
- Webhook Z-API → Claude (IA classifica + responde) → Postgres
- Kanban de leads, Inbox WhatsApp, lista VIP, modo reunião

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind v4 + GSAP + Lenis + Framer Motion
- Prisma 7 + PostgreSQL (Railway)
- Z-API (WhatsApp) + Anthropic Claude (Haiku + Sonnet)
- Auth JWT em cookie httpOnly

## Setup local

```bash
# 1. instalar deps
npm install

# 2. copiar variáveis
cp .env.example .env
# editar .env com DATABASE_URL, ZAPI_*, ANTHROPIC_API_KEY, etc.

# 3. gerar prisma client
npx prisma generate

# 4. rodar migrations
npx prisma migrate dev --name init

# 5. dev
npm run dev
```

## Variáveis de ambiente (obrigatórias)

| Var | Descrição |
|---|---|
| `DATABASE_URL` | Postgres connection string (Railway) |
| `JWT_SECRET` | string aleatória longa para assinar sessão |
| `ADMIN_EMAIL` | email do Jean (cria user na 1ª subida) |
| `ADMIN_PASSWORD` | senha inicial (trocar depois) |
| `ZAPI_INSTANCE_ID` | ID da instância Z-API |
| `ZAPI_TOKEN` | token Z-API |
| `ZAPI_CLIENT_TOKEN` | client-token Z-API (se ativo) |
| `ANTHROPIC_API_KEY` | chave Claude API |
| `AUTENTIQUE_TOKEN` | (Fase 3) |
| `GOOGLE_CLIENT_ID` / `SECRET` | (Fase 3) |

## Deploy Railway

1. Criar projeto no Railway
2. Adicionar serviço **PostgreSQL** → copiar `DATABASE_URL`
3. Adicionar serviço **GitHub repo** apontando pra este repo
4. Setar todas as vars de ambiente
5. Build command: `npx prisma generate && npx prisma migrate deploy && npm run build`
6. Start command: `npm start`
7. Conectar domínio `app.jeanizidoro.com.br` no Railway → criar CNAME no DNS

## Configurar webhook Z-API

No painel Z-API:
- **Receber Mensagens** → URL: `https://app.jeanizidoro.com.br/api/webhook/zapi`
- Habilitar: `Receber notificação de mensagens`

## Estrutura

```
app/
  (landing)/         landing page premium
  auth/              login do Jean
  app/               painel (protegido)
    page.tsx         Kanban de leads
    inbox/           inbox WhatsApp
    contatos/        VIPs
    ia/              configurar persona/regras
    agenda/          (fase 3 — Google Calendar)
    contratos/       (fase 3 — Autentique)
  api/
    auth/            login/logout
    webhook/zapi/    recebe msgs WhatsApp
    leads/           CRUD leads
    conversations/   inbox + envio manual
    contacts/        VIPs
    ai-config/       persona/regras IA
components/
  app/               componentes do painel
  *.tsx              landing page
lib/
  prisma.ts          singleton Prisma
  auth.ts            JWT + bcrypt
  zapi.ts            cliente Z-API
  claude.ts          Haiku (classifica) + Sonnet (responde)
  aiPipeline.ts      orquestrador msg → IA → resposta
prisma/
  schema.prisma      10 tabelas
```

## Roadmap

- **Fase 1 (concluída):** landing + auth + webhook Z-API + IA classifica/responde + painel base
- **Fase 2:** Google Calendar (agenda) + Autentique (contratos) + dashboard métricas
- **Fase 3:** Resumo diário automático no WhatsApp do Jean + relatórios

## Custos mensais estimados

| Item | Valor |
|---|---|
| Railway (DB + app) | ~$25 |
| Z-API Ultimate | R$ 100 |
| Claude API (~500 msgs/dia c/ caching) | ~R$ 40 |
| Autentique | R$ 0,50/contrato |
| **Total fixo** | **~R$ 290/mês** |
