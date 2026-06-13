"use client";

import { useEffect, useState } from "react";
import { SAMPLE_DOCUMENT } from "./sample";

const LOADING_MESSAGES = [
  "Reading your document...",
  "Identifying confusing terms...",
  "Checking for red flags...",
  "Calculating deadlines...",
  "Finalizing your breakdown...",
];

interface ExplainResult {
  summary: string;
  key_terms: { term: string; explanation: string }[];
  deadlines: { date_or_timeframe: string; what_happens: string }[];
  red_flags: { clause: string; why: string }[];
  next_steps: string[];
}

export default function Home() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExplainResult | null>(null);

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
      setResult(data as ExplainResult);
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
              disabled={loading || !text.trim()}
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
              disabled={loading}
              className="inline-flex items-center justify-center rounded-xl bg-white px-6 py-3 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 hover:ring-slate-400 disabled:opacity-50"
            >
              Try an example
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
  return (
    <div className="mt-8 space-y-5 sm:space-y-6 animate-fadein">
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

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-white"
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
