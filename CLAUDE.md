# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A multi-tenant SaaS platform where clients subscribe and get AI agents automatically deployed, connected to their CRM, email, and communications — zero technical setup required from the client.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | Node.js + Express + TypeScript |
| Database | PostgreSQL via Prisma ORM |
| Automation | N8N (self-hosted, API-controlled) |
| CRM | GoHighLevel (GHL) API v2 |
| Billing | Stripe subscriptions + webhooks |
| Voice | Bland.ai (inbound + outbound calls) |
| LinkedIn | ProxyCurl (prospect search) + Phantombuster (connection requests + messaging) |
| Social Media | Meta Graph API + Buffer API |
| Email | Gmail OAuth2 + SMTP (Nodemailer) |
| Client Portal | Next.js 14 (App Router) |
| AI/LLM | Anthropic Claude API (`claude-sonnet-4-20250514`) |
| Queue | Bull + Redis |
| Auth | NextAuth.js |
| Deployment | Docker + docker-compose |

## Monorepo Structure

```
ai-agency-platform/
├── apps/
│   ├── api/src/
│   │   ├── index.ts               # Express entry point
│   │   ├── routes/                # clients, agents, webhooks, onboarding
│   │   ├── services/              # External API wrappers (see Services below)
│   │   ├── agents/                # 9 agent definitions
│   │   ├── workflows/             # N8N JSON templates with {{VARIABLE}} placeholders
│   │   └── queue/                 # Bull workers: onboarding, agent-deploy
│   └── portal/                    # Next.js 14 client portal
│       └── app/
│           ├── (auth)/            # login, signup
│           ├── dashboard/         # main, agents, analytics, settings
│           └── onboarding/        # 3-step wizard
├── packages/shared/types/         # Shared TS interfaces (client, agent, workflow)
├── prisma/schema.prisma
└── docker/
```

## Development Commands

```bash
# Install all workspaces
npm install

# Database
npx prisma migrate dev          # Apply migrations
npx prisma generate             # Regenerate client after schema change
npx prisma studio               # Browse DB

# API
npm run dev --workspace=apps/api        # Start API (ts-node-dev)
npm run build --workspace=apps/api      # Compile TypeScript
npm run typecheck --workspace=apps/api  # Check without emitting

# Portal
npm run dev --workspace=apps/portal     # Start Next.js dev server
npm run build --workspace=apps/portal

# Docker (full stack)
docker-compose -f docker/docker-compose.yml up -d
```

## Database Schema

Key models — see `prisma/schema.prisma` for full definition:

- **Client** — `stripeCustomerId`, `plan` (STARTER/GROWTH/AGENCY), `status`, `ghlLocationId`
- **AgentDeployment** — `clientId`, `agentType` (enum), `status`, `n8nWorkflowId`, `config` (Json), `metrics` (Json)
- **ClientCredential** — AES-256 encrypted JSON blob per service (`gmail`, `hubspot`, `linkedin`, etc.)
- **Onboarding** — tracks step (1–3) and `data` Json of what has been connected

## Billing Plans

```typescript
STARTER  $97/mo  → LEAD_GENERATION, APPOINTMENT_SETTER, VOICE_INBOUND
GROWTH  $297/mo  → + LINKEDIN_OUTREACH, SOCIAL_MEDIA, VOICE_OUTBOUND
AGENCY  $697/mo  → + ADVERTISING, VOICE_CLOSER, CLIENT_SERVICES
```

Stripe price IDs live in env vars (`STRIPE_STARTER_PRICE_ID`, etc.). When a subscription is cancelled or payment fails, all agent workflows must be paused within 60 seconds via the Stripe webhook.

## Services (`apps/api/src/services/`)

| File | Purpose |
|------|---------|
| `ghl.service.ts` | GHL API v2 wrapper — sub-accounts, contacts, pipelines, calendar, SMS, email. All calls scoped to `locationId`. |
| `n8n.service.ts` | Deploy/pause/resume/delete N8N workflows. `deployWorkflow(templateName, clientConfig)` clones template and injects client vars. |
| `stripe.service.ts` | Subscription lifecycle, webhook signature verification |
| `voice.service.ts` | Bland.ai — provision phone numbers, create inbound/outbound agents, launch calls, fetch transcripts |
| `email.service.ts` | Gmail OAuth2 flow + SMTP sending via Nodemailer |
| `linkedin.service.ts` | ProxyCurl — prospect search; Phantombuster — connection requests + follow-up sequences |
| `ads.service.ts` | Meta Ads insights/pause/create + Google Ads insights/pause — called directly by Advertising Agent |
| `social.service.ts` | Buffer scheduling + Meta Graph API posting |
| `image.service.ts` | fal.ai FLUX image generation — called by Social Media Agent with Claude's `image_prompt` output, platform-aware sizing |
| `encrypt.ts` | AES-256 encrypt/decrypt for `ClientCredential.credentials` |
| `onboarding.service.ts` | **Master orchestrator** — chains all services post-payment: GHL sub-account → credentials → deploy agents → connect email → assign phone numbers → send welcome email |

## Agents (`apps/api/src/agents/`)

All agents extend `base.agent.ts`. Each has a typed `Config` interface, `deploy(clientId, config)` and `teardown(deploymentId)` methods.

| Agent | Trigger | Key config fields |
|-------|---------|-------------------|
| `lead-generation` | Schedule (2h) + form webhooks | `icp_description`, `lead_sources[]`, `pipeline_id`, `high_score_threshold` |
| `linkedin` | Daily schedule | `search_keywords`, `connection_message_template`, `followup_sequences[]`, `daily_limit` |
| `social-media` | Schedule + brief webhook | `business_description`, `platforms[]`, `content_pillars[]`, `buffer_token` |
| `advertising` | Daily + budget webhooks | `meta_ad_account_id`, `meta_access_token`, `meta_page_id`, `meta_default_adset_id`, `ad_link_url`, `google_ads_customer_id`, `google_refresh_token`, `target_roas`, `daily_budget_limit` |
| `appointment-setter` | GHL webhook (lead score > 70) | `followup_sequence[]`, `calendar_id`, `objection_handlers{}`, `booking_link` |
| `voice-inbound` | Inbound call (Bland.ai) | `greeting_script`, `faq_knowledge_base`, `escalation_number`, `calendar_id` |
| `voice-outbound` | Scheduled call list from GHL | `call_script`, `objection_handlers{}`, `max_daily_calls`, `call_window_hours` |
| `voice-closer` | GHL pipeline → "Ready to Close" | `closing_script_template`, `offer_details`, `payment_link`, `contract_link` |
| `client-services` | New sale webhook + schedule | `welcome_sequence[]`, `onboarding_checklist[]`, `health_score_weights{}` |

Voice agent scripts are **dynamically generated by Claude AI** using the client's business description — never static.

## N8N Workflow Templates

Stored as JSON in `apps/api/src/workflows/`. Use `{{VARIABLE}}` placeholders for client-specific values (locationId, API keys, phone numbers, prompts). `n8n.service.ts` substitutes these on deploy. Never hardcode client credentials in workflow JSON.

## Onboarding Wizard (Portal)

3 steps shown after signup:
1. **Plan selection** → Stripe Checkout
2. **Connect tools** (only after payment confirmed) → Gmail OAuth, optional CRM API key, LinkedIn cookie, business description, ICP textarea
3. **Progress screen** → animated steps, auto-redirect to dashboard on completion

Progress is tracked in the `Onboarding` model. Failed steps retry via Bull queue with exponential backoff.

## Critical Constraints

- All `ClientCredential` values must be AES-256 encrypted before DB insert; decrypt only in service layer
- All GHL API calls must use the client's `ghlLocationId` — never the master agency account
- N8N workflow variables injected at deploy time — credentials never stored in workflow JSON
- Stripe `customer.subscription.deleted` and `invoice.payment_failed` webhooks must pause all client workflows within 60 seconds
- `AgentDeployment.metrics` (Json) must be updated after every agent run for the dashboard

## Environment Variables

```env
DATABASE_URL=postgresql://...
ANTHROPIC_API_KEY=
GHL_API_KEY=
GHL_AGENCY_ID=
GHL_BASE_URL=https://services.leadconnectorhq.com
N8N_BASE_URL=http://localhost:5678
N8N_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_STARTER_PRICE_ID=
STRIPE_GROWTH_PRICE_ID=
STRIPE_AGENCY_PRICE_ID=
BLAND_API_KEY=
PHANTOMBUSTER_API_KEY=
REDIS_URL=redis://localhost:6379
ENCRYPTION_KEY=          # 32-byte hex string for AES-256
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
```

## Build Order

When building from scratch, follow this sequence:

1. Monorepo init (package.json, workspaces, tsconfig)
2. Prisma schema + initial migration
3. Shared types (`packages/shared/types/`)
4. Core services (encrypt → ghl → n8n → stripe → voice → email → linkedin → social → onboarding)
5. Agent definitions (all 9, with `deploy()` + `teardown()`)
6. N8N workflow JSON templates
7. Express routes (clients, agents, webhooks, onboarding)
8. Bull queue workers
9. Next.js portal (auth → onboarding wizard → dashboard → agent management)
10. Docker compose
