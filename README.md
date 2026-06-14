# Jargonaut

**Catch the illegal clauses before you sign.** Paste a lease, contract, or notice and get a plain-English breakdown with statute-backed findings highlighted in the document.

## Why this isn't a generic LLM wrapper

The model summarizes the document, but **verified findings come from a deterministic rules engine** (`app/rules.ts`) that runs server-side after every analysis. Five California rules are hardcoded today — deposit return window, deposit cap, entry without notice, excessive late fee, junk/elastic fees — each stamped with a **real citation** (e.g. Cal. Civ. Code §1950.5, §1954).

Every model red flag also goes through **server-side verbatim source-quote verification**: the API checks that `source_quote` is an exact substring of the pasted text before marking it verified.

The results view is a **redline UI**: the left column is the document on paper, with `<mark>` highlights on the exact offending clauses; the right rail lists verified findings as evidence tags. Click a finding to scroll to and flash its highlight.

## What else it does

- **Classified / redline theme** — paper background, stamp-red accents, dossier-style section headers, risk seal
- **Draft demand letter** — one click generates a tenant→landlord letter citing the flagged statutes (`/api/letter`)
- **PDF upload** — text extracted in the browser via `pdfjs-dist`; the file never leaves your machine until you submit
- **Session history** — collapsible **Recent analyses** list (in-memory, cleared on refresh); click to reload

> **Not legal advice.** For informational purposes only. Consult a licensed attorney for legal decisions.

## Tech stack

- **Next.js** (App Router) + React + TypeScript + Tailwind CSS
- **Groq** — Llama 3.3 70B (`llama-3.3-70b-versatile`) via the OpenAI-compatible endpoint (`openai` SDK). Provider is swappable with `LLM_BASE_URL` / `LLM_MODEL` (Gemini alternate documented in `.env.example`)
- **Deterministic rules engine** — `applyRules()` in `app/rules.ts`; not LLM-generated
- **`pdfjs-dist`** — client-side PDF extraction
- Two API routes: `/api/explain` (structured JSON + rules pass) and `/api/letter` (plain-text demand letter). No database, no auth

## Run locally

```bash
npm install
cp .env.example .env.local   # add LLM_API_KEY (free at console.groq.com)
npm run dev
```

Open http://localhost:3000. Click **Try an example** to load a sample California lease, or **Upload PDF** / paste your own text and hit **Review document**.

## Deploy to Vercel

1. Push to GitHub and import at [vercel.com/new](https://vercel.com/new).
2. Set **`LLM_API_KEY`**, and optionally **`LLM_BASE_URL`** / **`LLM_MODEL`**.
3. Deploy.

## AI usage disclosure

- **In the product:** Document summary, key terms, deadlines, model red flags, and next steps come from **Llama 3.3 70B on Groq** (OpenAI-compatible API). Verified statute findings and quote matching are **deterministic code**, not model output.
- **In development:** Cursor and Claude were used as coding assistants.

Model output can be wrong or incomplete. Jargonaut is an informational aid, not a substitute for a licensed attorney.
