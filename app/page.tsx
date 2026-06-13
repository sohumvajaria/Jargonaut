"use client";

import { useState } from "react";
import { SAMPLE_DOCUMENT } from "./sample";

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
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExplainResult | null>(null);

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
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <header className="mb-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            🪐 Jargonaut
          </h1>
          <p className="mt-2 text-base sm:text-lg text-slate-600">
            Understand what you&apos;re signing
          </p>
        </header>

        <section className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-4 sm:p-6">
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
            className="w-full h-56 sm:h-64 resize-y rounded-xl border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
          />

          <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-center">
            <button
              onClick={handleExplain}
              disabled={loading || !text.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 transition hover:bg-slate-50 disabled:opacity-50"
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
                className="text-sm text-slate-500 hover:text-slate-700 sm:ml-auto disabled:opacity-50"
              >
                Clear
              </button>
            )}
          </div>
        </section>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {result && <Results result={result} />}
      </main>

      <footer className="border-t border-slate-200 py-6 px-4 text-center text-xs text-slate-500">
        <p>
          Not legal advice. For informational purposes only. Consult a licensed
          attorney for legal decisions.
        </p>
      </footer>
    </div>
  );
}

function Results({ result }: { result: ExplainResult }) {
  return (
    <div className="mt-8 space-y-6">
      {/* Summary */}
      <Card title="Summary" icon="📄">
        <p className="text-slate-700 leading-relaxed">{result.summary}</p>
      </Card>

      {/* Key Terms */}
      {result.key_terms.length > 0 && (
        <Card title="Key Terms Explained" icon="🔑">
          <ul className="space-y-4">
            {result.key_terms.map((item, i) => (
              <li key={i}>
                <p className="font-semibold text-slate-900">{item.term}</p>
                <p className="text-slate-700 mt-0.5">{item.explanation}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Deadlines */}
      {result.deadlines.length > 0 && (
        <Card title="Important Deadlines" icon="⏰">
          <ul className="space-y-4">
            {result.deadlines.map((item, i) => (
              <li
                key={i}
                className="border-l-4 border-amber-400 bg-amber-50 rounded-r-lg pl-4 py-2"
              >
                <p className="font-semibold text-amber-900">
                  {item.date_or_timeframe}
                </p>
                <p className="text-amber-800 mt-0.5">{item.what_happens}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Red Flags */}
      <Card title="Red Flags" icon="🚩">
        {result.red_flags.length > 0 ? (
          <ul className="space-y-4">
            {result.red_flags.map((item, i) => (
              <li
                key={i}
                className="border-l-4 border-red-500 bg-red-50 rounded-r-lg pl-4 py-2"
              >
                <p className="font-semibold text-red-900">{item.clause}</p>
                <p className="text-red-800 mt-0.5">{item.why}</p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-green-800 font-medium">
            ✅ No major red flags detected.
          </div>
        )}
      </Card>

      {/* Next Steps */}
      {result.next_steps.length > 0 && (
        <Card title="Next Steps" icon="✅">
          <ul className="space-y-2 list-disc list-inside marker:text-indigo-500">
            {result.next_steps.map((step, i) => (
              <li key={i} className="text-slate-700">
                {step}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
        <span aria-hidden>{icon}</span>
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
