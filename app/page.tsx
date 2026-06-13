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

// Maps a 1-10 risk score to a label + Tailwind color classes. Kept in one place
// so the prominent header badge and the compact history rows stay consistent.
function riskTone(score: number) {
  if (score <= 3) {
    return {
      label: "Low Risk",
      number: "text-green-600",
      pillBg: "bg-green-50",
      pillRing: "ring-green-200",
      dot: "bg-green-500",
      pillText: "text-green-700",
    };
  }
  if (score <= 6) {
    return {
      label: "Medium Risk",
      number: "text-amber-600",
      pillBg: "bg-amber-50",
      pillRing: "ring-amber-200",
      dot: "bg-amber-500",
      pillText: "text-amber-700",
    };
  }
  return {
    label: "High Risk",
    number: "text-red-600",
    pillBg: "bg-red-50",
    pillRing: "ring-red-200",
    dot: "bg-red-500",
    pillText: "text-red-700",
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
        <header className="mb-8 sm:mb-10 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900">
            🪐 Jargonaut
          </h1>
          <p className="mt-3 text-base sm:text-lg text-slate-500">
            Understand what you&apos;re signing
          </p>
        </header>

        {/* Input card */}
        <section className="rounded-2xl bg-white p-5 sm:p-7 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.12)] ring-1 ring-slate-200/70">
          <label
            htmlFor="document"
            className="block text-sm font-medium text-slate-700 mb-2"
          >
            Paste your legal document
          </label>
          <textarea
            id="document"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the text of a lease, eviction notice, parking ticket, contract, or other legal document here…"
            className="w-full h-56 sm:h-64 resize-y rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-base leading-relaxed text-slate-900 placeholder:text-slate-400 transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:outline-none"
          />

          <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:items-center">
            <button
              onClick={handleExplain}
              disabled={loading || extracting || !text.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:bg-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="inline-flex items-center justify-center rounded-xl bg-white px-6 py-3 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 hover:ring-slate-400 disabled:opacity-50"
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
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 hover:ring-slate-400 disabled:opacity-50"
            >
              {extracting ? (
                <>
                  <Spinner dark />
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
                className="text-sm font-medium text-slate-400 transition hover:text-slate-600 sm:ml-auto disabled:opacity-50"
              >
                Clear
              </button>
            )}
          </div>

          {loading && (
            <div className="mt-6 flex items-center justify-center gap-3 border-t border-slate-100 pt-6">
              <span className="pulse-dot h-2.5 w-2.5 rounded-full bg-indigo-500" />
              <p
                key={loadingStep}
                className="animate-fadein text-sm font-medium text-slate-500"
                aria-live="polite"
              >
                {LOADING_MESSAGES[loadingStep]}
              </p>
            </div>
          )}
        </section>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">
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
        <p className="mx-auto max-w-md text-xs leading-relaxed text-slate-400">
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
      {/* Document type badge + risk score — sits above the Summary card. */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-sm">
          <span aria-hidden>📑</span>
          {result.document_type}
        </span>
        <div
          className={`inline-flex items-center gap-3 rounded-2xl px-4 py-2 ring-1 ${tone.pillBg} ${tone.pillRing}`}
        >
          <span className={`text-3xl font-bold leading-none ${tone.number}`}>
            {result.risk_score}
            <span className="text-base font-medium opacity-60">/10</span>
          </span>
          <div className="leading-tight">
            <p className={`text-sm font-bold ${tone.pillText}`}>{tone.label}</p>
            <p className="text-xs text-slate-500">Risk score</p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <Card title="Summary" icon="📄" accent="blue">
        <p className="text-[16px] leading-relaxed text-slate-700">
          {result.summary}
        </p>
      </Card>

      {/* Key Terms */}
      {result.key_terms.length > 0 && (
        <Card title="Key Terms Explained" icon="🔑" accent="amber">
          <div className="space-y-3">
            {result.key_terms.map((item, i) => (
              <div
                key={i}
                className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-100"
              >
                <p className="font-semibold text-slate-900">{item.term}</p>
                <p className="mt-1 text-[15px] leading-relaxed text-slate-600">
                  {item.explanation}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Deadlines */}
      {result.deadlines.length > 0 && (
        <Card title="Important Deadlines" icon="⏰" accent="orange">
          <div className="space-y-3">
            {result.deadlines.map((item, i) => (
              <div
                key={i}
                className="rounded-r-lg border-l-4 border-orange-400 bg-orange-50/70 py-3 pl-4 pr-4"
              >
                <p className="font-semibold text-orange-900">
                  {item.date_or_timeframe}
                </p>
                <p className="mt-1 text-[15px] leading-relaxed text-orange-800/90">
                  {item.what_happens}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Red Flags — highest-stakes section, more urgent treatment */}
      <Card title="Red Flags" icon="🚩" accent="red">
        {result.red_flags.length > 0 ? (
          <div className="space-y-3">
            {result.red_flags.map((item, i) => (
              <div
                key={i}
                className="rounded-r-lg border-l-4 border-red-500 bg-red-50 py-3 pl-4 pr-4 ring-1 ring-red-100"
              >
                <p className="font-semibold text-red-900">{item.clause}</p>
                <p className="mt-1 text-[15px] leading-relaxed text-red-800/90">
                  {item.why}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 font-medium text-green-800">
            <span aria-hidden>✅</span>
            No major red flags detected.
          </div>
        )}
      </Card>

      {/* Next Steps */}
      {result.next_steps.length > 0 && (
        <Card title="Next Steps" icon="✅" accent="green">
          <ul className="space-y-2.5">
            {result.next_steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-700"
                >
                  {i + 1}
                </span>
                <span className="text-[15px] leading-relaxed text-slate-700">
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

const ACCENTS = {
  blue: "bg-blue-50 text-blue-600",
  amber: "bg-amber-50 text-amber-600",
  orange: "bg-orange-50 text-orange-600",
  red: "bg-red-50 text-red-600",
  green: "bg-green-50 text-green-600",
} as const;

function Card({
  title,
  icon,
  accent,
  children,
}: {
  title: string;
  icon: string;
  accent: keyof typeof ACCENTS;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-5 sm:p-7 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.10)] ring-1 ring-slate-200/70">
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-slate-900">
        <span
          aria-hidden
          className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg ${ACCENTS[accent]}`}
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
    <section className="mt-8 overflow-hidden rounded-2xl bg-white shadow-[0_4px_24px_-8px_rgba(15,23,42,0.10)] ring-1 ring-slate-200/70">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-slate-50/70 sm:px-7"
      >
        <span className="flex items-center gap-3 text-lg font-semibold text-slate-900">
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-lg text-slate-600"
          >
            🕓
          </span>
          Recent Analyses
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
            {history.length}
          </span>
        </span>
        <svg
          className={`h-5 w-5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
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
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {history.map((entry) => {
            const tone = riskTone(entry.result.risk_score);
            return (
              <li key={entry.id}>
                <button
                  onClick={() => onSelect(entry)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left transition hover:bg-slate-50 sm:px-7"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span aria-hidden className="text-slate-400">
                      📑
                    </span>
                    <span className="truncate font-medium text-slate-800">
                      {entry.result.document_type}
                    </span>
                  </span>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tone.pillBg} ${tone.pillRing} ${tone.pillText}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                    {entry.result.risk_score}/10 · {tone.label}
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

function Spinner({ dark = false }: { dark?: boolean }) {
  return (
    <svg
      className={`h-4 w-4 animate-spin ${dark ? "text-slate-500" : "text-white"}`}
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
