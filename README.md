# 🪐 Jargonaut

**Understand what you're signing.**

Paste the text of a lease, eviction notice, parking ticket, contract, or any
other dense legal document, hit **Explain This**, and Jargonaut returns a
plain-English breakdown powered by Claude:

- **Summary** — what the document is and what it means for you
- **Key Terms Explained** — the confusing phrases, decoded
- **Important Deadlines** — dates and time-sensitive obligations
- **Red Flags** — unusual, one-sided, or questionable clauses (or a green
  all-clear if none are found)
- **Next Steps** — concrete actions to consider

> ⚖️ **Not legal advice.** For informational purposes only. Consult a licensed
> attorney for legal decisions.

## Tech

- Next.js (App Router) + React + TypeScript
- Tailwind CSS
- A single API route (`app/api/explain/route.ts`) that calls the Claude API
  (`claude-sonnet-4-6`) via `@anthropic-ai/sdk`
- No database, no auth

## Local development

```bash
npm install
cp .env.example .env.local   # then add your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000. Click **Try an example** to load a sample lease
clause (with a hidden fee and an unusual deadline) and see Jargonaut in action.

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new).
3. Add an environment variable **`ANTHROPIC_API_KEY`** with your key.
4. Deploy.

That's it — no other configuration needed.
