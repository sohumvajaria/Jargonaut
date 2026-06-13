"use client";

import { useEffect, useRef, useState } from "react";
import { SAMPLE_DOCUMENT } from "./sample";
import { extractPdfText } from "./pdf";

const LOADING_MESSAGES = [
  "Reading your document...",
  "Identifying confusing terms...",
  "Checking for red flags...",
  "Calculating deadlines...",
  "Finalizing your breakdown...",
];

interface ExplainResult {
  document_type: string;
  risk_score: number;
  summary: string;
  key_terms: { term: string; explanation: string }[];
  deadlines: { date_or_timeframe: string; what_happens: string }[];
  red_flags: { clause: string; why: string }[];
  next_steps: string[];
}

interface HistoryEntry {
  id: number;
  result: ExplainResult;
}

// Maps a 1-10 risk score to a label + color classes for the dark theme. Low risk
// uses the teal accent (rather than green) so it ties into the rest of the UI;
// medium/high stay amber/red so the warning semantics read instantly. Kept in
// one place so the big header badge and the compact history rows agree.
function riskTone(score: number) {
  if (score <= 3) {
    return {
      label: "Low Risk",
      fillBg: "bg-accent", // solid badge background
      fillText: "text-accent-ink", // dark text that sits on the fill
      accentText: "text-accent", // bright text on dark surfaces
      dot: "bg-accent",
    };
  }
  if (score <= 6) {
    return {
      label: "Medium Risk",
      fillBg: "bg-amber-400",
      fillText: "text-amber-950",
      accentText: "text-amber-400",
      dot: "bg-amber-400",
    };
  }
  return {
    label: "High Risk",
    fillBg: "bg-red-500",
    fillText: "text-red-50",
    accentText: "text-red-400",
    dot: "bg-red-500",
  };
}

export default function Home() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExplainResult | null>(null);
  // Session-only history: lives in memory, clears on refresh. Newest first.
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(true);
  // PDF upload state.
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cycle the loading messages every 5s while waiting, stopping on the last one.
  useEffect(() => {
    if (!loading) return;
    setLoadingStep(0);
    const id = setInterval(() => {
      setLoadingStep((step) => Math.min(step + 1, LOADING_MESSAGES.length - 1));
    }, 5000);
    return () => clearInterval(id);
  }, [loading]);

  async function handleExplain() {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Something went wrong. Please try again.");
      }
      const explained = data as ExplainResult;
      setResult(explained);
      // Record this analysis in the session history (newest first).
      setHistory((prev) => [{ id: Date.now(), result: explained }, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function loadExample() {
    setText(SAMPLE_DOCUMENT);
    setResult(null);
    setError(null);
  }

  // Reload a past analysis into the main view without re-calling the API.
  function loadFromHistory(entry: HistoryEntry) {
    setResult(entry.result);
    setError(null);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  // Extract text from an uploaded PDF entirely in the browser, then drop it into
  // the textarea so the existing "Explain This" flow works unchanged.
  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Allow re-selecting the same file later by resetting the input value.
    e.target.value = "";
    if (!file) return;

    setError(null);
    setExtracting(true);
    try {
      const extracted = await extractPdfText(file);
      if (!extracted.trim()) {
        throw new Error("No selectable text found in this PDF.");
      }
      setText(extracted);
      setResult(null);
    } catch (err) {
      // Leave the textarea untouched and surface a clear message.
      setError(
        err instanceof Error && err.message
          ? `Couldn't read that PDF: ${err.message} You can paste the text instead.`
          : "Couldn't read that PDF. You can paste the text instead."
      );
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen font-sans">
      <main className="flex-1 w-full max-w-content mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <header className="mb-9 sm:mb-12 text-center">
          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-[-0.02em] text-white">
            Jargonaut<span className="text-accent">.</span>
          </h1>
          <p className="mt-3 text-base sm:text-lg text-slate-400">
            Understand what you&apos;re signing
          </p>
        </header>

        {/* Input card */}
        <section className="rounded-2xl border border-white/10 bg-surface p-5 sm:p-7">
          <label
            htmlFor="document"
            className="block text-sm font-medium text-slate-300 mb-2"
          >
            Paste your legal document
          </label>
          <textarea
            id="document"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the text of a lease, eviction notice, parking ticket, contract, or other legal document here…"
            className="w-full h-56 sm:h-64 resize-y rounded-xl border border-white/10 bg-ink p-4 text-base leading-relaxed text-slate-100 placeholder:text-slate-500 transition focus:border-accent focus:ring-4 focus:ring-accent/15 focus:outline-none"
          />

          <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:items-center">
            <button
              onClick={handleExplain}
              disabled={loading || extracting || !text.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-accent-ink transition hover:bg-[#00c4a0] active:bg-[#00b393] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Spinner />
                  Analyzing…
                </>
              ) : (
                "Explain This"
              )}
            </button>
            <button
              onClick={loadExample}
              disabled={loading || extracting}
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/10 disabled:opacity-50"
            >
              Try an example
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={handlePdfUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || extracting}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/10 disabled:opacity-50"
            >
              {extracting ? (
                <>
                  <Spinner />
                  Reading PDF…
                </>
              ) : (
                <>
                  <span aria-hidden>📄</span>
                  Upload PDF
                </>
              )}
            </button>
            {text && (
              <button
                onClick={() => {
                  setText("");
                  setResult(null);
                  setError(null);
                }}
                disabled={loading}
                className="text-sm font-medium text-slate-500 transition hover:text-slate-300 sm:ml-auto disabled:opacity-50"
              >
                Clear
              </button>
            )}
          </div>

          {loading && (
            <div className="mt-6 flex items-center justify-center gap-3 border-t border-white/10 pt-6">
              <span className="pulse-dot h-2.5 w-2.5 rounded-full bg-accent" />
              <p
                key={loadingStep}
                className="animate-fadein text-sm font-medium text-slate-400"
                aria-live="polite"
              >
                {LOADING_MESSAGES[loadingStep]}
              </p>
            </div>
          )}
        </section>

        {error && (
          <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {result && <Results result={result} />}

        {history.length > 0 && (
          <RecentAnalyses
            history={history}
            open={historyOpen}
            onToggle={() => setHistoryOpen((o) => !o)}
            onSelect={loadFromHistory}
          />
        )}
      </main>

      <footer className="px-4 pb-10 pt-6 text-center">
        <p className="mx-auto max-w-md text-xs leading-relaxed text-slate-600">
          Not legal advice. For informational purposes only. Consult a licensed
          attorney for legal decisions.
        </p>
      </footer>
    </div>
  );
}

function Results({ result }: { result: ExplainResult }) {
  const tone = riskTone(result.risk_score);
  return (
    <div className="mt-8 space-y-5 sm:space-y-6 animate-fadein">
      {/* Document type badge + prominent risk score — sits above the Summary. */}
      <div className="flex flex-wrap items-stretch gap-3">
        <span className="inline-flex items-center gap-2 self-center rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-slate-200">
          <span aria-hidden>📑</span>
          {result.document_type}
        </span>
        <div
          className={`inline-flex items-center gap-4 rounded-2xl px-6 py-4 ${tone.fillBg}`}
        >
          <div className="flex items-baseline gap-1">
            <span
              className={`text-5xl sm:text-6xl font-extrabold leading-none ${tone.fillText}`}
            >
              {result.risk_score}
            </span>
            <span className={`text-xl font-bold ${tone.fillText} opacity-60`}>
              /10
            </span>
          </div>
          <div className="leading-tight">
            <p className={`text-base font-bold ${tone.fillText}`}>{tone.label}</p>
            <p className={`text-xs font-medium opacity-70 ${tone.fillText}`}>
              Risk score
            </p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <Card title="Summary" icon="📄">
        <p className="text-[15px] leading-relaxed text-slate-300">
          {result.summary}
        </p>
      </Card>

      {/* Key Terms */}
      {result.key_terms.length > 0 && (
        <Card title="Key Terms Explained" icon="🔑">
          <div className="space-y-3">
            {result.key_terms.map((item, i) => (
              <div
                key={i}
                className="rounded-lg border border-white/10 bg-white/[0.02] p-4"
              >
                <p className="font-semibold text-white">{item.term}</p>
                <p className="mt-1 text-[14px] leading-relaxed text-slate-400">
                  {item.explanation}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Deadlines */}
      {result.deadlines.length > 0 && (
        <Card title="Important Deadlines" icon="⏰" chip="amber">
          <div className="space-y-4">
            {result.deadlines.map((item, i) => (
              <div key={i} className="border-l-[3px] border-amber-400 pl-4">
                <p className="font-semibold text-amber-300">
                  {item.date_or_timeframe}
                </p>
                <p className="mt-1 text-[14px] leading-relaxed text-slate-400">
                  {item.what_happens}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Red Flags — left border accent, no background tint: clean and urgent. */}
      <Card title="Red Flags" icon="🚩" chip="red">
        {result.red_flags.length > 0 ? (
          <div className="space-y-4">
            {result.red_flags.map((item, i) => (
              <div key={i} className="border-l-[3px] border-red-500 pl-4">
                <p className="font-semibold text-red-400">{item.clause}</p>
                <p className="mt-1 text-[14px] leading-relaxed text-slate-400">
                  {item.why}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 font-medium text-accent">
            <span aria-hidden>✓</span>
            No major red flags detected.
          </div>
        )}
      </Card>

      {/* Next Steps */}
      {result.next_steps.length > 0 && (
        <Card title="Next Steps" icon="✅">
          <ul className="space-y-2.5">
            {result.next_steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono text-xs font-bold text-accent"
                >
                  {i + 1}
                </span>
                <span className="text-[14px] leading-relaxed text-slate-300">
                  {step}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// Header-icon chip color per section. Defaults to the teal accent; deadlines and
// red flags keep their semantic warning colors.
const CHIPS = {
  accent: "border-accent/20 bg-accent/10 text-accent",
  amber: "border-amber-400/20 bg-amber-400/10 text-amber-400",
  red: "border-red-500/20 bg-red-500/10 text-red-400",
} as const;

function Card({
  title,
  icon,
  chip = "accent",
  children,
}: {
  title: string;
  icon: string;
  chip?: keyof typeof CHIPS;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-surface p-5 sm:p-7">
      <h2 className="mb-4 flex items-center gap-3 text-sm font-bold uppercase tracking-wider text-slate-200">
        <span
          aria-hidden
          className={`flex h-8 w-8 items-center justify-center rounded-lg border text-base ${CHIPS[chip]}`}
        >
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function RecentAnalyses({
  history,
  open,
  onToggle,
  onSelect,
}: {
  history: HistoryEntry[];
  open: boolean;
  onToggle: () => void;
  onSelect: (entry: HistoryEntry) => void;
}) {
  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-surface">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-white/5 sm:px-7"
      >
        <span className="flex items-center gap-3 text-sm font-bold uppercase tracking-wider text-slate-200">
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-base text-accent"
          >
            🕓
          </span>
          Recent Analyses
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-xs font-medium text-slate-400">
            {history.length}
          </span>
        </span>
        <svg
          className={`h-5 w-5 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <ul className="divide-y divide-white/5 border-t border-white/10">
          {history.map((entry) => {
            const tone = riskTone(entry.result.risk_score);
            return (
              <li key={entry.id}>
                <button
                  onClick={() => onSelect(entry)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left transition hover:bg-white/5 sm:px-7"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span aria-hidden className="text-slate-600">
                      📑
                    </span>
                    <span className="truncate text-sm font-medium text-slate-200">
                      {entry.result.document_type}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                    <span
                      className={`font-mono text-sm font-semibold tabular-nums ${tone.accentText}`}
                    >
                      {entry.result.risk_score}/10
                    </span>
                    <span className="hidden text-xs text-slate-500 sm:inline">
                      {tone.label}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Spinner() {
  // Inherits the parent's text color so it works on both the teal primary
  // button and the muted secondary buttons.
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
