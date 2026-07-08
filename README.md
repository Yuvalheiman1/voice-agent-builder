# VoiceBuilder

A web app where a user chats with an AI **builder** that creates and edits a **Vapi voice assistant** in natural language. The generated assistant makes outbound calls to leads, qualifies them, and books meetings.

> Built end to end as a solo project: builder chat, live call, booking webhook.

## Tech Stack
- **Next.js** (App Router, TypeScript)
- **Vercel AI SDK** - builder chat (streaming + tool calling)
- **Vapi** - voice assistant, outbound calls, telephony
- **SQLite** (local) - call records (leads later)
- **Cal.com** - meeting booking (via a Vapi function tool)
- **ngrok** - public tunnel for Vapi webhooks (run locally)

## Getting Started
```bash
npm install
cp .env.example .env.local   # then fill in your keys
npm run dev                  # http://localhost:3000
```

### Environment variables (`.env.local`)
```
VAPI_API_KEY=                  # Vapi private (server) key
NEXT_PUBLIC_VAPI_PUBLIC_KEY=   # Vapi public key (browser Web SDK)
CAL_API_KEY=                   # Cal.com booking
OPENAI_API_KEY=                # or ANTHROPIC_API_KEY - builder chat model
PUBLIC_BASE_URL=               # ngrok URL, for Vapi webhooks → local server
```
Storage is local **SQLite** (`voicebuilder.db`) - no DB service to configure.

## Project Structure
```
app/                 routes + builder chat UI
app/api/             route handlers (chat, assistants, calls, vapi webhook)
lib/                 vapi + supabase + cal.com clients
supabase/            schema / migrations
.claude/             Agentic OS (context, skills, project knowledge)
```

## Development
- Vapi function tools (booking) need a public URL - deploy to Vercel or use an ngrok tunnel to test booking locally.
- Test the voice agent in-browser with Vapi's Web SDK (no phone needed) before real outbound calls.
- Demo flow to record: describe agent → generate → outbound call → qualify → book meeting.

## Contributing
- Branch naming: `feature/`, `fix/`, `chore/`
- Commit style: imperative present ("add builder chat route")
- PRs describe what changed and why
