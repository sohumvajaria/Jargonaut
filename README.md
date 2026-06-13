# 🪐 Jargonaut

**Understand what you're signing** — paste any legal document and get a plain-English breakdown in seconds.

## The problem

Leases, eviction notices, parking tickets, loan agreements, and terms of service are written in dense legalese that most people can't realistically parse. The important parts — hidden fees, tight deadlines, waived rights — are buried in clauses designed to be skimmed past. People sign anyway, because hiring a lawyer to review every document is impractical.

Jargonaut closes that gap. Paste the text (or upload a PDF), hit **Explain This**, and get back:

- **Document type** — a quick label for what you're looking at (e.g. *Lease Agreement*, *Parking Ticket*, *Employment Contract*)
- **Risk score** — an at-a-glance 1–10 rating (Low / Medium / High), driven by the number and severity of red flags
- **Summary** — what the document is and what it means for you
- **Key Terms Explained** — the confusing phrases, decoded
- **Important Deadlines** — dates and time-sensitive obligations
- **Red Flags** — genuinely unusual, one-sided, or potentially unlawful clauses (or an all-clear when there are none)
- **Next Steps** — concrete actions to consider

### Also included

- **PDF upload** — drop in a PDF and the text is extracted right in your browser (via `pdfjs-dist`), then runs through the same analysis. Pasting still works exactly as before.
- **Session history** — every analysis is kept in a collapsible **Recent Analyses** list for the session (in memory only, cleared on refresh); click any entry to reload it.
- **Dark UI** — a distinctive dark-navy theme with a sharp teal accent.

> ⚖️ **Not legal advice.** For informational purposes only. Consult a licensed attorney for legal decisions.

## Tech stack

- **Next.js** (App Router) + React + TypeScript
- **Claude Haiku API** (`claude-haiku-4-5-20251001`) via `@anthropic-ai/sdk` — fast, low-cost structured JSON extraction
- **Tailwind CSS** for styling (dark theme, Inter + JetBrains Mono)
- **`pdfjs-dist`** for client-side PDF text extraction — files never leave the browser
- A single API route (`app/api/explain/route.ts`) handles the Claude call, strips any markdown code fences from the response, and retries once if the model returns unparseable JSON; no database, no auth

## Run it locally

```bash
npm install
cp .env.example .env.local   # then add your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000. Click **Try an example** to load a sample lease clause (with a hidden fee and an unusual deadline) and see Jargonaut in action without needing your own document — or **Upload PDF** to analyze your own file.

You'll need an Anthropic API key — get one at [console.anthropic.com](https://console.anthropic.com/).

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new).
3. Add an environment variable **`ANTHROPIC_API_KEY`** with your key.
4. Deploy — no other configuration needed.

## AI usage disclosure

This project uses AI in two distinct ways:

- **In the product:** The document analysis is powered by **Claude (Haiku model — `claude-haiku-4-5-20251001`)** from Anthropic. When you click "Explain This," the pasted or extracted text is sent to the Claude API, which returns the structured breakdown (document type, risk score, summary, key terms, deadlines, red flags, and next steps). No analysis is hard-coded — the model does the interpretation, including the risk rating.
- **In development:** **Claude Code** and **Cursor** were used as AI development tools throughout the build — scaffolding the app, writing and refactoring code, designing the UI, and tuning the prompt.

AI output can be wrong or incomplete. Jargonaut is an informational aid, not a substitute for a licensed attorney.
