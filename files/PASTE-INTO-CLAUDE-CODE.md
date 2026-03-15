# ======================================================
# PASTE THIS ENTIRE MESSAGE INTO CLAUDE CODE TO BEGIN
# ======================================================

I want you to build a complete AI Agent Rental Platform. 
Read the CLAUDE.md file in this directory — it contains the full specification.

Please build the entire project in this order, completing each step fully before moving to the next:

**Step 1**: Initialise the monorepo structure with all folders, package.json files, and TypeScript configs

**Step 2**: Create the Prisma schema with all models (Client, AgentDeployment, ClientCredential, Onboarding + all enums)

**Step 3**: Build all shared TypeScript types in packages/shared/types/

**Step 4**: Build all backend services in apps/api/src/services/:
- ghl.service.ts (full GoHighLevel API wrapper)
- n8n.service.ts (workflow deploy/pause/resume/delete)
- stripe.service.ts (subscription management)
- voice.service.ts (Bland.ai inbound + outbound)
- email.service.ts (Gmail OAuth + SMTP)
- linkedin.service.ts (Phantombuster integration)
- social.service.ts (Buffer + Meta Graph API)
- encrypt.ts utility (AES-256 encrypt/decrypt)
- onboarding.service.ts (master orchestrator)

**Step 5**: Build all 9 agent definition files in apps/api/src/agents/ with full TypeScript types, config interfaces, deploy() and teardown() methods:
1. lead-generation.agent.ts
2. linkedin.agent.ts
3. social-media.agent.ts
4. advertising.agent.ts
5. appointment-setter.agent.ts
6. voice-inbound.agent.ts
7. voice-outbound.agent.ts
8. voice-closer.agent.ts
9. client-services.agent.ts

**Step 6**: Create all 9 N8N workflow JSON templates in apps/api/src/workflows/ with {{VARIABLE}} placeholders for client-specific values

**Step 7**: Build the Express API with all routes (clients, agents, webhooks, onboarding)

**Step 8**: Build Bull queue workers for onboarding and agent deployment

**Step 9**: Build the Next.js portal:
- Auth pages (login/signup)
- 3-step onboarding wizard (plan selection → connect tools → progress screen)
- Main dashboard with agent status cards and metrics
- Agent management page (pause/resume/configure each agent)
- Settings page

**Step 10**: Create docker-compose.yml with postgres, redis, n8n, api, and portal services

**Step 11**: Create a full README.md with setup instructions, environment variable guide, and deployment steps

After building everything, run a check to make sure all TypeScript compiles without errors.

The CLAUDE.md file has all the details — refer to it throughout. Build everything production-ready.
