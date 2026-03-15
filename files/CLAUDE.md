# AI Agency Rental Platform — Claude Code Master Brief

## Project Overview
Build a fully automated, multi-tenant AI agent rental platform where clients sign up, pay monthly, and get AI agents deployed automatically — connected to their CRM, email, and communications — with zero technical setup required from the client.

## Tech Stack
- **Backend**: Node.js + Express
- **Database**: PostgreSQL (via Prisma ORM)
- **Automation Engine**: N8N (self-hosted, API-controlled)
- **CRM Platform**: GoHighLevel (GHL) API v2
- **Billing**: Stripe (subscriptions + webhooks)
- **Voice Agents**: Bland.ai or Vapi.ai API
- **LinkedIn Agent**: Phantombuster + LinkedIn API
- **Social Media**: Meta Graph API + Buffer API
- **Email**: Gmail OAuth2 + SMTP (Nodemailer)
- **Client Portal**: Next.js 14 (App Router)
- **AI/LLM**: Anthropic Claude API (claude-sonnet-4-20250514)
- **Queue**: Bull + Redis
- **Auth**: NextAuth.js
- **Deployment**: Docker + docker-compose

---

## Project Structure to Build

```
ai-agency-platform/
├── apps/
│   ├── portal/                        # Client-facing Next.js portal
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx
│   │   │   │   └── signup/page.tsx
│   │   │   ├── dashboard/
│   │   │   │   ├── page.tsx           # Main dashboard
│   │   │   │   ├── agents/page.tsx    # Active agents overview
│   │   │   │   ├── analytics/page.tsx # Agent performance metrics
│   │   │   │   └── settings/page.tsx  # Client settings
│   │   │   ├── onboarding/
│   │   │   │   ├── page.tsx           # Step 1: Plan selection
│   │   │   │   ├── connect/page.tsx   # Step 2: Connect CRM/email
│   │   │   │   └── complete/page.tsx  # Step 3: Confirmation
│   │   │   └── api/
│   │   │       ├── auth/[...nextauth]/route.ts
│   │   │       ├── webhooks/stripe/route.ts
│   │   │       └── agents/[id]/route.ts
│   │   ├── components/
│   │   │   ├── ui/                    # shadcn/ui components
│   │   │   ├── AgentCard.tsx
│   │   │   ├── AgentStatusBadge.tsx
│   │   │   ├── OnboardingWizard.tsx
│   │   │   ├── ConnectCRMForm.tsx
│   │   │   └── MetricsDashboard.tsx
│   │   └── package.json
│   │
│   └── api/                           # Core backend API
│       ├── src/
│       │   ├── index.ts               # Express app entry
│       │   ├── routes/
│       │   │   ├── clients.ts
│       │   │   ├── agents.ts
│       │   │   ├── webhooks.ts
│       │   │   └── onboarding.ts
│       │   ├── services/
│       │   │   ├── ghl.service.ts           # GoHighLevel API wrapper
│       │   │   ├── n8n.service.ts           # N8N workflow management
│       │   │   ├── stripe.service.ts        # Billing management
│       │   │   ├── voice.service.ts         # Bland.ai/Vapi voice agents
│       │   │   ├── linkedin.service.ts      # LinkedIn automation
│       │   │   ├── social.service.ts        # Social media posting
│       │   │   ├── email.service.ts         # Email connection + sending
│       │   │   ├── crm.service.ts           # CRM integration router
│       │   │   └── onboarding.service.ts    # Full onboarding orchestrator
│       │   ├── agents/                      # Agent definitions
│       │   │   ├── base.agent.ts
│       │   │   ├── lead-generation.agent.ts
│       │   │   ├── linkedin.agent.ts
│       │   │   ├── social-media.agent.ts
│       │   │   ├── advertising.agent.ts
│       │   │   ├── appointment-setter.agent.ts
│       │   │   ├── voice-inbound.agent.ts
│       │   │   ├── voice-outbound.agent.ts
│       │   │   ├── voice-closer.agent.ts
│       │   │   ├── client-services.agent.ts
│       │   │   └── index.ts
│       │   ├── workflows/                   # N8N workflow templates (JSON)
│       │   │   ├── lead-generation.workflow.json
│       │   │   ├── linkedin-outreach.workflow.json
│       │   │   ├── social-media.workflow.json
│       │   │   ├── advertising.workflow.json
│       │   │   ├── appointment-setter.workflow.json
│       │   │   ├── voice-inbound.workflow.json
│       │   │   ├── voice-outbound.workflow.json
│       │   │   ├── voice-closer.workflow.json
│       │   │   ├── client-services.workflow.json
│       │   │   └── onboarding-master.workflow.json
│       │   ├── queue/
│       │   │   ├── onboarding.queue.ts
│       │   │   └── agent-deploy.queue.ts
│       │   ├── middleware/
│       │   │   ├── auth.ts
│       │   │   └── rateLimit.ts
│       │   └── utils/
│       │       ├── logger.ts
│       │       ├── encrypt.ts         # AES-256 for client credentials
│       │       └── webhook-verify.ts
│       └── package.json
│
├── packages/
│   └── shared/                        # Shared types across apps
│       ├── types/
│       │   ├── client.types.ts
│       │   ├── agent.types.ts
│       │   └── workflow.types.ts
│       └── package.json
│
├── prisma/
│   └── schema.prisma                  # Full database schema
│
├── docker/
│   ├── docker-compose.yml
│   ├── Dockerfile.api
│   └── Dockerfile.portal
│
└── package.json                       # Monorepo root
```

---

## Database Schema (Prisma)

Build the following models in `prisma/schema.prisma`:

```prisma
model Client {
  id                String    @id @default(cuid())
  businessName      String
  email             String    @unique
  phone             String?
  stripeCustomerId  String    @unique
  stripeSubId       String?
  plan              Plan      @default(STARTER)
  status            ClientStatus @default(PENDING)
  ghlSubAccountId   String?
  ghlLocationId     String?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  agents            AgentDeployment[]
  credentials       ClientCredential[]
  onboarding        Onboarding?
}

model AgentDeployment {
  id            String      @id @default(cuid())
  clientId      String
  client        Client      @relation(fields: [clientId], references: [id])
  agentType     AgentType
  status        AgentStatus @default(INACTIVE)
  n8nWorkflowId String?
  config        Json        # Agent-specific config (phone numbers, prompts, etc.)
  metrics       Json?       # Performance metrics
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
}

model ClientCredential {
  id          String   @id @default(cuid())
  clientId    String
  client      Client   @relation(fields: [clientId], references: [id])
  service     String   # 'gmail', 'hubspot', 'salesforce', 'linkedin', etc.
  credentials String   # AES-256 encrypted JSON blob
  createdAt   DateTime @default(now())
}

model Onboarding {
  id          String           @id @default(cuid())
  clientId    String           @unique
  client      Client           @relation(fields: [clientId], references: [id])
  step        Int              @default(1)
  status      OnboardingStatus @default(IN_PROGRESS)
  completedAt DateTime?
  data        Json             # Tracks what has been connected
}

enum Plan { STARTER GROWTH AGENCY }
enum ClientStatus { PENDING ACTIVE PAUSED CANCELLED }
enum AgentStatus { INACTIVE ACTIVE PAUSED ERROR }
enum OnboardingStatus { IN_PROGRESS COMPLETED FAILED }
enum AgentType {
  LEAD_GENERATION
  LINKEDIN_OUTREACH
  SOCIAL_MEDIA
  ADVERTISING
  APPOINTMENT_SETTER
  VOICE_INBOUND
  VOICE_OUTBOUND
  VOICE_CLOSER
  CLIENT_SERVICES
}
```

---

## Agent Definitions to Build

### 1. Lead Generation Agent (`lead-generation.agent.ts`)
**Purpose**: Scrapes, scores and routes leads into GHL pipeline automatically.
**Triggers**: Scheduled (every 2 hours) + webhook from web forms
**Actions**:
- Pull leads from configured sources (website form, Facebook Lead Ads, Google Ads)
- Score lead using Claude AI (0-100 score based on ICP criteria)
- Create contact in GHL sub-account
- Add to correct pipeline stage based on score
- Trigger follow-up sequence in GHL
- Notify appointment setter agent if score > 70
**Config fields**: `icp_description`, `lead_sources[]`, `scoring_prompt`, `pipeline_id`, `high_score_threshold`

### 2. LinkedIn Outreach Agent (`linkedin.agent.ts`)
**Purpose**: Automated LinkedIn prospecting, connection requests, and follow-up sequences.
**Triggers**: Scheduled daily + manual campaign trigger
**Actions**:
- Search LinkedIn for ICP-matched prospects using Phantombuster
- Send personalised connection requests (Claude-generated, human-sounding)
- Follow-up sequence: connect → message 1 (day 2) → message 2 (day 5) → message 3 (day 10)
- Detect replies and route to human or appointment setter
- Log all activity to GHL contact timeline
**Config fields**: `search_url`, `connection_message_template`, `followup_sequences[]`, `daily_limit`, `linkedin_cookie`

### 3. Social Media Agent (`social-media.agent.ts`)
**Purpose**: Creates, schedules and posts content across all social platforms.
**Triggers**: Scheduled + content brief webhook
**Actions**:
- Generate content calendar (Claude AI) based on business type and goals
- Create platform-specific posts (LinkedIn, Facebook, Instagram, Twitter/X)
- Generate image prompts for Canva/DALL-E
- Schedule via Buffer API
- Monitor engagement and report weekly
- Respond to comments using pre-approved templates
**Config fields**: `business_description`, `tone`, `posting_frequency`, `platforms[]`, `content_pillars[]`, `buffer_token`

### 4. Advertising Agent (`advertising.agent.ts`)
**Purpose**: Manages and optimises paid ad campaigns across Meta and Google.
**Triggers**: Daily optimisation check + budget alert webhooks
**Actions**:
- Monitor campaign performance (CTR, CPC, ROAS)
- Pause underperforming ad sets automatically
- Generate new ad copy variants using Claude AI
- A/B test headlines and descriptions
- Alert human if budget exceeded or ROAS drops below threshold
- Create weekly performance report to GHL contact
**Config fields**: `meta_ad_account_id`, `google_ads_customer_id`, `target_roas`, `daily_budget_limit`, `alert_email`

### 5. Appointment Setter Agent (`appointment-setter.agent.ts`)
**Purpose**: Follows up with leads via SMS/email and books appointments into GHL calendar.
**Triggers**: New lead webhook from GHL + lead score > 70 from lead gen agent
**Actions**:
- Send SMS + email follow-up sequence (Claude-written, conversational)
- Detect replies (positive/negative/question) using Claude AI classifier
- Handle objections with pre-approved responses
- Send calendar booking link when prospect is ready
- Create appointment in GHL calendar
- Send confirmation and reminder messages
- Hand off to closer agent when appointment confirmed
**Config fields**: `followup_sequence[]`, `calendar_id`, `objection_handlers{}`, `booking_link`, `sms_number`

### 6. Voice Inbound Agent (`voice-inbound.agent.ts`)
**Purpose**: Answers inbound calls 24/7, qualifies callers, and routes or books appointments.
**Triggers**: Inbound call to client's phone number (via Bland.ai/Vapi)
**Actions**:
- Answer call with branded greeting
- Qualify caller using dynamic question flow
- Answer FAQs using knowledge base
- Book appointments directly into GHL calendar
- Take messages and create GHL contact + task
- Escalate to human if caller requests or sentiment is negative
- Log full call transcript to GHL contact
**Config fields**: `greeting_script`, `qualification_questions[]`, `faq_knowledge_base`, `escalation_number`, `voice_id`, `calendar_id`

### 7. Voice Outbound Agent (`voice-outbound.agent.ts`)
**Purpose**: Makes outbound calls to leads for follow-up, reminders and reactivation.
**Triggers**: Scheduled call list from GHL + manual trigger
**Actions**:
- Call leads from GHL pipeline stage
- Run qualification / follow-up script
- Handle objections dynamically
- Book appointments and update GHL
- Send follow-up SMS after call
- Mark call outcome in GHL (interested / not interested / callback / booked)
**Config fields**: `call_script`, `objection_handlers{}`, `max_daily_calls`, `call_window_hours`, `retry_attempts`, `ghl_pipeline_stage`

### 8. Voice Closer Agent (`voice-closer.agent.ts`)
**Purpose**: Makes closing calls to warm prospects who have had a demo or consultation.
**Triggers**: GHL pipeline stage change to "Ready to Close" + manual trigger
**Actions**:
- Call prospect at scheduled time
- Run personalised closing script (uses prospect data from GHL)
- Handle price objections, timing objections, competitor objections
- Process verbal agreement and send contract/payment link via SMS
- Update GHL deal to Closed Won/Lost
- Trigger client services agent on close
**Config fields**: `closing_script_template`, `offer_details`, `payment_link`, `contract_link`, `objection_scripts{}`, `commission_tracking`

### 9. Client Services Agent (`client-services.agent.ts`)
**Purpose**: Post-sale onboarding, support, retention and upsell for existing clients.
**Triggers**: New sale webhook + scheduled check-ins + support email/SMS
**Actions**:
- Send welcome sequence after sale
- Onboarding checklist follow-up (days 1, 3, 7, 14, 30)
- Monitor client health score (engagement, NPS, support tickets)
- Handle support requests via email/SMS using Claude AI
- Escalate complex issues to human with full context
- Trigger upsell sequences when client hits usage thresholds
- Send monthly performance reports
- Churn risk detection and intervention
**Config fields**: `welcome_sequence[]`, `onboarding_checklist[]`, `nps_schedule`, `health_score_weights{}`, `upsell_triggers[]`

---

## Services to Build

### `ghl.service.ts` — GoHighLevel API Wrapper
Build a complete wrapper for GHL API v2 with these methods:
- `createSubAccount(clientData)` — creates new location/sub-account
- `createContact(locationId, contactData)`
- `updateContact(locationId, contactId, data)`
- `addContactToWorkflow(locationId, contactId, workflowId)`
- `createAppointment(locationId, appointmentData)`
- `getPipelineStages(locationId, pipelineId)`
- `moveContactToPipelineStage(locationId, contactId, stageId)`
- `sendSMS(locationId, contactId, message)`
- `sendEmail(locationId, contactId, emailData)`
- `createNote(locationId, contactId, note)`
- `getCalendarSlots(locationId, calendarId, dateRange)`

### `n8n.service.ts` — N8N Workflow Manager
- `deployWorkflow(templateName, clientConfig)` — clones template, injects client vars, activates
- `pauseWorkflow(workflowId)`
- `resumeWorkflow(workflowId)`
- `deleteWorkflow(workflowId)`
- `getWorkflowStatus(workflowId)`
- `triggerWorkflow(workflowId, payload)`
- `listClientWorkflows(clientId)`

### `onboarding.service.ts` — Master Onboarding Orchestrator
This is the most important service. It runs after Stripe payment confirmed:
1. Create GHL sub-account for client
2. Store encrypted credentials
3. Deploy agent workflows based on plan
4. Connect email (OAuth flow or SMTP)
5. Connect CRM if client has existing one
6. Assign phone numbers for voice agents
7. Send welcome email with portal login
8. Mark onboarding complete

### `voice.service.ts` — Voice Agent Manager
- `createInboundAgent(config)` — provisions phone number + agent on Bland.ai
- `createOutboundAgent(config)`
- `launchOutboundCall(agentId, phoneNumber, contactData)`
- `getCallTranscript(callId)`
- `updateAgentPrompt(agentId, newPrompt)`

---

## Onboarding Wizard (Portal — `OnboardingWizard.tsx`)
3-step wizard shown to client after signup:

**Step 1 — Pick Your Plan**
- Show 3 plan cards (Starter $97 / Growth $297 / Agency $697)
- Each shows which agents are included
- Stripe Checkout on selection

**Step 2 — Connect Your Tools** (only after payment confirmed)
- Gmail OAuth button ("Connect Gmail")
- Optional: "Do you use a CRM?" dropdown (HubSpot / Salesforce / Zoho / None)
- If CRM selected: show API key input with instructions
- LinkedIn cookie input (with Loom video guide)
- Business description textarea (for AI agent training)
- ICP (ideal customer profile) textarea

**Step 3 — We're Setting Everything Up**
- Animated progress screen showing:
  - ✅ Creating your workspace
  - ✅ Connecting your email
  - ✅ Deploying your agents
  - ✅ Running first checks
- Auto-redirects to dashboard when complete

---

## Billing Plans & Agent Access

```typescript
export const PLANS = {
  STARTER: {
    price: 97,
    stripePriceId: 'price_starter',
    agents: ['LEAD_GENERATION', 'APPOINTMENT_SETTER', 'VOICE_INBOUND']
  },
  GROWTH: {
    price: 297,
    stripePriceId: 'price_growth',
    agents: ['LEAD_GENERATION', 'LINKEDIN_OUTREACH', 'SOCIAL_MEDIA',
             'APPOINTMENT_SETTER', 'VOICE_INBOUND', 'VOICE_OUTBOUND']
  },
  AGENCY: {
    price: 697,
    stripePriceId: 'price_agency',
    agents: ['LEAD_GENERATION', 'LINKEDIN_OUTREACH', 'SOCIAL_MEDIA',
             'ADVERTISING', 'APPOINTMENT_SETTER', 'VOICE_INBOUND',
             'VOICE_OUTBOUND', 'VOICE_CLOSER', 'CLIENT_SERVICES']
  }
}
```

---

## Environment Variables Needed

```env
# Database
DATABASE_URL=postgresql://...

# Anthropic
ANTHROPIC_API_KEY=

# GoHighLevel
GHL_API_KEY=
GHL_AGENCY_ID=
GHL_BASE_URL=https://services.leadconnectorhq.com

# N8N
N8N_BASE_URL=http://localhost:5678
N8N_API_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_STARTER_PRICE_ID=
STRIPE_GROWTH_PRICE_ID=
STRIPE_AGENCY_PRICE_ID=

# Voice (Bland.ai)
BLAND_API_KEY=

# LinkedIn (Phantombuster)
PHANTOMBUSTER_API_KEY=

# Redis
REDIS_URL=redis://localhost:6379

# Encryption
ENCRYPTION_KEY=  # 32-byte hex string for AES-256

# Email
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=

# App
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
```

---

## Build Instructions for Claude Code

Build this project in the following order:

1. **Init monorepo** — set up package.json, workspaces, TypeScript configs
2. **Prisma schema** — create all models and run initial migration
3. **Shared types** — build all TypeScript interfaces in packages/shared
4. **Core services** — build ghl.service, n8n.service, stripe.service, voice.service, email.service, encrypt.util
5. **Onboarding service** — build the master orchestrator that chains all services
6. **Agent definitions** — build all 9 agent files with full config types and deploy methods
7. **N8N workflow templates** — create all 9 JSON workflow templates with variable placeholders
8. **API routes** — build Express routes for clients, agents, webhooks, onboarding
9. **Queue workers** — build Bull queues for onboarding and agent deployment
10. **Portal — Auth** — NextAuth setup with email + credentials provider
11. **Portal — Onboarding Wizard** — 3-step wizard component
12. **Portal — Dashboard** — main dashboard with agent cards and metrics
13. **Portal — Agent Management** — agent status, pause/resume, config editing
14. **Docker** — docker-compose with postgres, redis, api, portal, n8n
15. **README** — full setup and deployment guide

---

## Key Requirements

- All client credentials (API keys, passwords, OAuth tokens) must be AES-256 encrypted before storing in the database
- N8N workflows must use environment variable injection — never hardcode client credentials in workflow JSON
- All GHL operations must be scoped to the client's sub-account locationId — never the master account
- Voice agent scripts must be dynamically generated using Claude AI based on client's business description
- Failed onboarding steps must be retried via Bull queue with exponential backoff
- When Stripe subscription is cancelled or payment fails, all client agent workflows must be paused automatically within 60 seconds via webhook
- The portal must be fully mobile responsive
- All agent metrics must be stored and queryable for the client dashboard

