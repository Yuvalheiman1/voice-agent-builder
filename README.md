# VoiceBuilder

A web app where you build a **Vapi voice assistant** by chatting with an AI **builder**, then talk to that assistant live in your browser - it qualifies the lead and books a meeting by emailing you (the operator).

> Built end to end as a solo project: builder chat, live call, booking webhook.

## How it works (two AIs)

- **Builder** (our app) - writes the assistant *config*. A chat UI (`/api/chat`) edits one `AssistantConfig` object.
- **Runtime** (Vapi) - holds the live voice call. Our app POSTs the config to Vapi; **Vapi is the source of truth** for assistants and calls.

Live flow: pick a **persona** → build agent → save to Vapi → **in-browser web call** (WebRTC, no phone) → agent qualifies → calls the `book_meeting` tool → our webhook emails the operator via Resend. The dashboard shows **live call status** ("● On a call", Ringing…) and the **outcome** (booked / qualified / not-qualified) with an AI summary + transcript - web tests surface as a "Browser test" lead.

## Tech Stack
- **Next.js** (App Router, TypeScript)
- **Vercel AI SDK** (`ai` + `@ai-sdk/openai`) - builder chat
- **Vapi** (`@vapi-ai/web`, `@vapi-ai/server-sdk`) - voice assistant + in-browser web call
- **Resend** - booking-notification email to the operator
- **localStorage** - client-side persistence for now (Turso later)
- **Vitest** - unit tests for the backend logic
- **Vercel** - deploy target (public URL; the Vapi webhook must be publicly reachable)

## Getting Started

```bash
npm install
cp .env.example .env.local   # then fill in your keys (see below)
npm run dev                  # http://localhost:3000
npm test                     # run the unit tests (vitest)
```

Then open the app and click **New** to build an agent: **pick a persona** (▶ to hear its voice), then **chat** - tap suggestion chips or type freely - to shape it. Hit **Create** (it saves to Vapi and shows a green **connected** badge) and click **📞 Test call** to talk to it in your browser. Click an agent to **view** its settings (read-only) or **delete** it.

> Persona voice previews are drop-in: add `public/agents/<persona>-sample.mp3` (see `public/agents/VOICE-SAMPLES.md`). Missing files just disable the ▶ button.

### Environment variables (`.env.local`)

| Variable | What it's for | Where to get it |
|----------|---------------|-----------------|
| `VAPI_API_KEY` | Server: create/update assistants, calls | Vapi dashboard → API Keys (**private**) |
| `NEXT_PUBLIC_VAPI_PUBLIC_KEY` | Browser: the in-browser web call | Vapi dashboard → API Keys (**public**) |
| `OPENAI_API_KEY` | Builder chat model (`gpt-4o`) | https://platform.openai.com/api-keys |
| `RESEND_API_KEY` | Send the booking email | https://resend.com/api-keys |
| `OPERATOR_EMAIL` | Inbox that receives booking notices | your email |
| `PUBLIC_BASE_URL` | Public base URL for the Vapi `book_meeting` webhook | your deployed URL, e.g. `https://<project>.vercel.app`. **Set it even for local dev** - if blank, agents saved from localhost push with no webhook and booking silently fails (see gotcha). Restart `next dev` after editing. |

## Deploying to Vercel

```bash
vercel --prod            # build + deploy to production
```

Requirements:
1. Add all the env vars above in **Vercel → Settings → Environment Variables** (Production).
2. Turn **off** Vercel **Deployment Protection** (Settings → Deployment Protection → Vercel Authentication) so the site and webhook are publicly reachable.
3. Set `PUBLIC_BASE_URL` to your **public production alias** (e.g. `https://<project>.vercel.app`).

> ⚠️ **Webhook gotcha:** Vapi calls our `/api/vapi/webhook` from its servers, so that URL must be public. Vercel keeps the *deployment-specific* URL (`<project>-<hash>-<team>.vercel.app`) behind Deployment Protection (returns **401**) even when the production alias is public. So the webhook must use the **public production domain** (`PUBLIC_BASE_URL` / `VERCEL_PROJECT_PRODUCTION_URL`) - **never the bare `VERCEL_URL`**. `lib/vapi.ts` handles this.
>
> ⚠️ **Empty `PUBLIC_BASE_URL` = no booking.** If it's blank, `baseUrl()` returns `""` and the assistant is pushed with **no `book_meeting` server URL** → Vapi returns `"No result returned"` and no email is sent. Set it (production URL is fine, even locally) and restart the dev server.
>
> ⚠️ **Re-save agents after config/code changes.** Voice, analysis schema, and system prompt are baked into the Vapi assistant at push time. Edit an existing agent → **Save** to re-push; new agents get the latest automatically.

## Project Structure
```
app/                 dashboard UI (agents, leads, call panel)
app/api/chat         builder chat - edits the AssistantConfig (generateObject)
app/api/assistants   POST config → create/update the Vapi assistant
app/api/vapi/webhook book_meeting → Resend email; end-of-call-report → log
lib/assistant-config config type, defaults, merge
lib/vapi             Vapi server client + assistant payload builder
lib/email            booking email (Resend) - buildBookingEmail is unit-tested
lib/webhook          Vapi webhook parsers - unit-tested
lib/store            localStorage persistence
.claude/             Agentic OS (context, skills, project knowledge)
docs/                design spec + implementation plan
```

## Testing
- `npm test` runs Vitest. Pure backend logic is TDD'd: `lib/email.test.ts`, `lib/webhook.test.ts`.
- Voice calls can't be unit-tested - verify them live in the browser.

## Debugging - where are the logs

There is no single log pane; the system spans four services. When something breaks, follow the source that owns it:

| Source | What it has | How to follow it |
|--------|-------------|------------------|
| **Vapi call log** ⭐ | Every call: full transcript, **tool-call args + results/errors** | Vapi dashboard → Calls, or `GET https://api.vapi.ai/call` (Bearer `VAPI_API_KEY`). Richest source for "why did the call/booking fail" - e.g. a `book_meeting` result of `{"code":"401",...}` means the webhook URL was unreachable. |
| **Vercel runtime logs** | Backend: API routes, the webhook's `console.log`, server errors | `vercel logs <deployment-url>`, or Vercel dashboard → project → **Logs**. |
| **Resend logs** | Email send + delivery status | resend.com dashboard → Emails |
| **Browser console** | Client-side `CallPanel` / Web SDK errors | DevTools (F12) → Console, during a call |

**Fast triage:** call/booking wrong → Vapi call record first; backend threw → `vercel logs`; email missing → Resend; UI/mic → browser console.

## Contributing
- Branch naming: `feat/`, `fix/`, `chore/`
- Commit style: imperative present ("add builder chat route")
- Never commit `.env*` or secrets.
