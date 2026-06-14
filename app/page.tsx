"use client";

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Check,
  Clock,
  Copy,
  FileText,
  Flag,
  KeyRound,
  ListChecks,
  Maximize2,
  Minimize2,
  PenLine,
  Scale,
  ScrollText,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import {
  GYM_CONTRACT_DOCUMENT,
  PARKING_TICKET_DOCUMENT,
  SAMPLE_DOCUMENT,
} from "./sample";
import { getSampleResult } from "./sample-result";
import type { ExplainResult } from "./explain-result";
import { extractPdfText } from "./pdf";
import type { VerifiedFinding } from "./rules";
import {
  buildHighlightPlan,
  highlightDocument,
} from "./highlight-document";

const EXAMPLE_OPTIONS = [
  { label: "Landlord lease", document: SAMPLE_DOCUMENT },
  { label: "Parking ticket", document: PARKING_TICKET_DOCUMENT },
  { label: "Gym contract", document: GYM_CONTRACT_DOCUMENT },
] as const;

const PLACEHOLDER_PHRASES = [
  "rental agreement",
  "eviction notice",
  "employment contract",
  "security deposit clause",
] as const;

const COLLAPSED_TEXTAREA_MAX_HEIGHT = 140;

const LOADING_MESSAGES = [
  "Reading your document...",
  "Identifying confusing terms...",
  "Checking for red flags...",
  "Calculating deadlines...",
  "Finalizing your breakdown...",
];

function SectionIcon({
  icon: Icon,
  className,
  size = 18,
}: {
  icon: LucideIcon;
  className?: string;
  size?: number;
}) {
  return <Icon size={size} strokeWidth={1.75} className={className} aria-hidden />;
}

function indefiniteArticle(phrase: string): "a" | "an" {
  const first = phrase.trim().charAt(0).toLowerCase();
  if (first === "a" || first === "e" || first === "i" || first === "o" || first === "u") {
    return "an";
  }
  return "a";
}

function TypewriterPlaceholder({ active }: { active: boolean }) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [phase, setPhase] = useState<"typing" | "pause" | "deleting">("typing");

  useEffect(() => {
    if (!active) return;

    const phrase = PLACEHOLDER_PHRASES[phraseIndex];
    let timeout: ReturnType<typeof setTimeout>;

    if (phase === "typing") {
      if (charIndex < phrase.length) {
        timeout = setTimeout(() => setCharIndex((current) => current + 1), 55);
      } else {
        timeout = setTimeout(() => setPhase("pause"), 0);
      }
    } else if (phase === "pause") {
      timeout = setTimeout(() => setPhase("deleting"), 1800);
    } else if (charIndex > 0) {
      timeout = setTimeout(() => setCharIndex((current) => current - 1), 30);
    } else {
      setPhraseIndex((current) => (current + 1) % PLACEHOLDER_PHRASES.length);
      setPhase("typing");
    }

    return () => clearTimeout(timeout);
  }, [active, phraseIndex, charIndex, phase]);

  if (!active) return null;

  const phrase = PLACEHOLDER_PHRASES[phraseIndex];
  const shown = phrase.slice(0, charIndex);
  const article = indefiniteArticle(phrase);

  return (
    <span
      className="pointer-events-none absolute left-0 top-1.5 select-none font-sans text-[15px] text-ink-muted/45"
      aria-hidden
    >
      Paste in {article} {shown}
      <span className="ml-0.5 animate-pulse text-ink-muted/45">|</span>
    </span>
  );
}

function fitTextareaHeight(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function recordAnalysis(
  explained: ExplainResult,
  documentText: string,
  setAnalyzedText: (value: string) => void,
  setResult: (value: ExplainResult | null) => void
): void {
  setAnalyzedText(documentText);
  setResult(explained);
}

// Maps a 1-10 risk score to stamp colors for the classified light theme.
function riskTone(score: number) {
  if (score <= 3) {
    return {
      label: "CLEARED",
      border: "border-cleared",
      text: "text-cleared",
      accentText: "text-cleared",
      dot: "bg-cleared",
    };
  }
  if (score <= 6) {
    return {
      label: "Medium Risk",
      border: "border-medium",
      text: "text-medium",
      accentText: "text-medium",
      dot: "bg-medium",
    };
  }
  return {
    label: "High Risk",
    border: "border-stamp",
    text: "text-stamp",
    accentText: "text-stamp",
    dot: "bg-stamp",
  };
}

export default function Home() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExplainResult | null>(null);
  const [analyzedText, setAnalyzedText] = useState("");
  // PDF upload state.
  const [extracting, setExtracting] = useState(false);
  const [inputExpanded, setInputExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    if (!inputExpanded) {
      textarea.style.height = "";
      return;
    }

    fitTextareaHeight(textarea);
  }, [text, inputExpanded]);

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
        const sampleResult = getSampleResult(text);
        if (sampleResult) {
          recordAnalysis(sampleResult, text, setAnalyzedText, setResult);
          return;
        }
        throw new Error(data?.error || "Something went wrong. Please try again.");
      }
      const explained = data as ExplainResult;
      recordAnalysis(explained, text, setAnalyzedText, setResult);
    } catch (err) {
      const sampleResult = getSampleResult(text);
      if (sampleResult) {
        recordAnalysis(sampleResult, text, setAnalyzedText, setResult);
        return;
      }
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function loadExample(exampleDocument: string) {
    const sampleResult = getSampleResult(exampleDocument);
    if (!sampleResult) return;
    setText(exampleDocument);
    recordAnalysis(sampleResult, exampleDocument, setAnalyzedText, setResult);
    setError(null);
    requestAnimationFrame(() => {
      window.document
        .getElementById("analysis-results")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function handleClearDocument(): void {
    setText("");
    setResult(null);
    setAnalyzedText("");
    setError(null);
    setInputExpanded(false);
  }

  // Extract text from an uploaded PDF entirely in the browser, then drop it into
  // the textarea so the existing "Explain This" flow works unchanged.
  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
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

  const hasResults = Boolean(result && (analyzedText || text));

  return (
    <div className="flex min-h-screen flex-col bg-paper font-sans text-ink">
      <nav className="flex items-center justify-end px-6 py-5 sm:px-10 lg:px-16">
        <div className="hidden items-center gap-5 sm:flex">
          <span className="text-xs text-ink">About</span>
          <span className="text-xs text-ink">How it works</span>
        </div>
      </nav>

      <main className="flex w-full flex-1 flex-col">
        <div
          className={`mx-auto flex w-full max-w-3xl flex-col px-6 sm:px-8 ${
            hasResults ? "pb-4 pt-8" : "flex flex-1 justify-center py-10 sm:py-14"
          }`}
        >
          <div className="w-full">
            <header className="mb-7 text-center sm:mb-9">
              <p className="mb-3 font-sans text-[clamp(2rem,5vw,3.875rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-stamp sm:mb-4">
                Jargonaut.
              </p>
              <h1 className="whitespace-nowrap font-display text-[clamp(1.75rem,4.5vw,3.5rem)] font-normal leading-[1.14] tracking-[-0.025em] text-ink">
                The fine print,{" "}
                <span className="italic underline decoration-stamp decoration-[3px] underline-offset-[0.18em]">
                  redlined.
                </span>
              </h1>
            </header>

            <section className="w-full">
              <label htmlFor="document" className="sr-only">
                Paste your document
              </label>
              <div
                className={`relative flex w-full gap-3 rounded-[1.75rem] border border-edge/70 bg-surface px-4 py-3 shadow-[0_2px_14px_rgba(27,24,19,0.05)] transition-shadow duration-200 focus-within:border-edge focus-within:shadow-[0_4px_20px_rgba(27,24,19,0.07)] focus-within:ring-2 focus-within:ring-stamp/10 sm:px-5 sm:py-3.5 ${
                  hasResults ? "flex-col" : "items-end"
                }`}
              >
                <div className="relative min-h-[28px] w-full min-w-0 flex-1">
                  <TypewriterPlaceholder active={!text.trim()} />
                  <textarea
                    ref={textareaRef}
                    id="document"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder=" "
                    rows={2}
                    style={
                      inputExpanded
                        ? undefined
                        : { maxHeight: `${COLLAPSED_TEXTAREA_MAX_HEIGHT}px` }
                    }
                    className={`block w-full resize-none border-0 bg-transparent pt-0.5 font-sans text-[15px] leading-relaxed text-ink focus:outline-none ${
                      inputExpanded
                        ? "min-h-[52px] overflow-hidden sm:min-h-[56px]"
                        : "min-h-[52px] overflow-y-auto sm:min-h-[56px]"
                    }`}
                  />
                </div>

                {!hasResults && (
                  <div className="flex shrink-0 items-center gap-1.5 self-center pb-0.5">
                    {text && (
                      <button
                        type="button"
                        onClick={handleClearDocument}
                        disabled={loading}
                        aria-label="Clear document"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors duration-200 hover:bg-ink/[0.04] hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stamp disabled:opacity-50"
                      >
                        <SectionIcon icon={X} size={16} />
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={handlePdfUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={loading || extracting}
                      aria-label="Upload PDF"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-edge/80 bg-paper text-ink-muted transition-colors duration-200 hover:border-ink/15 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stamp disabled:opacity-50"
                    >
                      {extracting ? (
                        <Spinner />
                      ) : (
                        <SectionIcon icon={Upload} size={17} />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleExplain}
                      disabled={loading || extracting || !text.trim()}
                      aria-label="Review document"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-stamp text-white transition-all duration-200 hover:bg-stamp-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stamp active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loading ? (
                        <Spinner />
                      ) : (
                        <SectionIcon icon={ArrowRight} size={18} className="text-white" />
                      )}
                    </button>
                  </div>
                )}

                {hasResults && (
                  <div className="flex w-full items-center justify-end gap-1.5 pt-1">
                    {text && (
                      <button
                        type="button"
                        onClick={handleClearDocument}
                        disabled={loading}
                        aria-label="Clear document"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors duration-200 hover:bg-ink/[0.04] hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stamp disabled:opacity-50"
                      >
                        <SectionIcon icon={X} size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setInputExpanded((current) => !current)}
                      disabled={loading || extracting}
                      aria-label={inputExpanded ? "Minimize document input" : "Expand document input"}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-edge/80 bg-paper text-ink-muted transition-colors duration-200 hover:border-ink/15 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stamp disabled:opacity-50"
                    >
                      <SectionIcon
                        icon={inputExpanded ? Minimize2 : Maximize2}
                        size={16}
                      />
                    </button>
                  </div>
                )}
              </div>

              {loading && (
                <div className="mt-5 flex items-center gap-3">
                  <span className="pulse-dot h-2 w-2 rounded-full bg-stamp" />
                  <p
                    key={loadingStep}
                    className="animate-fadein text-sm text-ink-muted"
                    aria-live="polite"
                  >
                    {LOADING_MESSAGES[loadingStep]}
                  </p>
                </div>
              )}

              <div className="mt-4 flex flex-col items-center justify-center gap-2.5 sm:flex-row sm:gap-4">
                <p className="shrink-0 text-[10px] font-medium uppercase tracking-[0.24em] text-ink-muted/80">
                  Try an example
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {EXAMPLE_OPTIONS.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => loadExample(option.document)}
                      disabled={loading || extracting}
                      className="rounded-full border border-edge/80 bg-surface px-3.5 py-1.5 text-[13px] text-ink-muted transition-all duration-200 hover:border-ink/15 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stamp disabled:opacity-50"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mt-6 rounded-2xl border border-stamp/25 bg-stamp/[0.06] px-5 py-4 text-sm leading-relaxed text-stamp-deep"
                >
                  {error}
                </div>
              )}
            </section>
          </div>
        </div>

        {hasResults && (
          <Results result={result!} documentText={analyzedText || text} />
        )}
      </main>

      <footer className="mt-auto px-6 py-7 text-center sm:px-10 lg:px-16">
        <p className="mx-auto max-w-3xl text-[11px] leading-relaxed text-ink-muted/80">
          Not legal advice. Jargonaut is an automated tool, can be wrong, and is no substitute for
          a licensed attorney. © 2026 Jargonaut
        </p>
      </footer>
    </div>
  );
}

interface LetterFindingPayload {
  title?: string;
  clause?: string;
  citation?: string;
  explanation?: string;
  why?: string;
}

function Results({
  result,
  documentText,
}: {
  result: ExplainResult;
  documentText: string;
}) {
  const [letterLoading, setLetterLoading] = useState(false);
  const [letterText, setLetterText] = useState<string | null>(null);
  const [letterError, setLetterError] = useState<string | null>(null);
  const [letterOpen, setLetterOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hoveredFindingId, setHoveredFindingId] = useState<string | null>(null);

  const tone = riskTone(result.risk_score);
  const verifiedFindings = result.verified_findings ?? [];
  const { highlights, highlightedIds, railRedFlags } = buildHighlightPlan(
    documentText,
    verifiedFindings,
    result.red_flags
  );
  const jurisdictionLabel =
    result.jurisdiction !== "Unknown" ? result.jurisdiction : "California";
  const findingCount = verifiedFindings.length + result.red_flags.length;
  const hasFindings = findingCount >= 1;

  useEffect(() => {
    document.querySelectorAll("mark[data-finding-id]").forEach((el) => {
      el.classList.remove("mark-emphasis", "mark-emphasis-medium");
    });
    if (!hoveredFindingId) {
      return;
    }
    const mark = document.querySelector(
      `mark[data-finding-id="${CSS.escape(hoveredFindingId)}"]`
    );
    if (!(mark instanceof HTMLElement)) {
      return;
    }
    if (mark.dataset.severity === "medium") {
      mark.classList.add("mark-emphasis-medium");
    } else {
      mark.classList.add("mark-emphasis");
    }
  }, [hoveredFindingId, documentText]);

  function handleMarkHover(event: React.MouseEvent<HTMLElement>): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const mark = target.closest("mark[data-finding-id]");
    if (mark instanceof HTMLElement && mark.dataset.findingId) {
      setHoveredFindingId(mark.dataset.findingId);
    }
  }

  function handleDocumentMouseLeave(event: React.MouseEvent<HTMLElement>): void {
    const related = event.relatedTarget;
    if (!(related instanceof Node) || !event.currentTarget.contains(related)) {
      setHoveredFindingId(null);
    }
  }

  function handleDocumentClick(event: React.MouseEvent<HTMLElement>): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const mark = target.closest("mark[data-finding-id]");
    if (mark instanceof HTMLElement && mark.dataset.findingId) {
      scrollToFindingCard(mark.dataset.findingId);
    }
  }

  function scrollToFindingCard(id: string): void {
    const card = document.querySelector(
      `[data-finding-card="${CSS.escape(id)}"]`
    );
    if (!(card instanceof HTMLElement)) {
      return;
    }
    setHoveredFindingId(id);
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function scrollToMark(id: string): void {
    const mark = document.querySelector(`mark[data-finding-id="${CSS.escape(id)}"]`);
    if (!(mark instanceof HTMLElement)) {
      return;
    }
    mark.scrollIntoView({ behavior: "smooth", block: "center" });
    mark.classList.remove("mark-flash", "mark-flash-medium");
    void mark.offsetWidth;
    if (mark.dataset.severity === "medium") {
      mark.classList.add("mark-flash-medium");
    } else {
      mark.classList.add("mark-flash");
    }
    window.setTimeout(() => {
      mark.classList.remove("mark-flash", "mark-flash-medium");
    }, 1000);
  }

  const verifiedEmpty = verifiedFindings.length === 0;
  const otherEmpty = railRedFlags.length === 0;

  async function handleDraftLetter(): Promise<void> {
    if (letterLoading || !hasFindings) return;

    const findings: LetterFindingPayload[] = [
      ...verifiedFindings.map((finding) => ({
        title: finding.title,
        citation: finding.citation,
        explanation: finding.explanation,
      })),
      ...result.red_flags.map((flag) => ({
        clause: flag.clause,
        why: flag.why,
      })),
    ];

    setLetterLoading(true);
    setLetterError(null);
    setLetterOpen(true);
    setCopied(false);

    try {
      const res = await fetch("/api/letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: result.document_type,
          jurisdiction: result.jurisdiction,
          findings,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Something went wrong. Please try again.");
      }
      setLetterText(typeof data.letter === "string" ? data.letter : "");
    } catch (err) {
      setLetterError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
      setLetterText(null);
    } finally {
      setLetterLoading(false);
    }
  }

  async function handleCopyLetter(): Promise<void> {
    if (!letterText) return;
    try {
      await navigator.clipboard.writeText(letterText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section
      id="analysis-results"
      className="mt-16 animate-fadein scroll-mt-10"
      style={{ animationDelay: "0ms" }}
    >
      <div className="mx-auto max-w-results">
        <div
          className="grid grid-cols-1 gap-8 animate-fadein md:grid-cols-[58fr_42fr] md:gap-10"
          style={{ animationDelay: "75ms" }}
        >
          <div className="min-w-0">
            <p className="mb-4 text-xs font-semibold leading-relaxed text-stamp">
              Document under review
            </p>
            <article
              className="rounded-lg border border-edge bg-surface p-7 sm:p-9"
              onMouseOver={handleMarkHover}
              onMouseLeave={handleDocumentMouseLeave}
              onClick={handleDocumentClick}
            >
              <p className="whitespace-pre-wrap font-serif text-[15px] leading-[1.9] text-ink sm:text-base sm:leading-[1.95]">
                {highlightDocument(documentText, highlights)}
              </p>
            </article>
          </div>

          <aside className="min-w-0 space-y-8 font-sans md:sticky md:top-10 md:self-start md:pr-1">
            <section>
              <DossierSectionHeader title="Verified flags" />
              {verifiedEmpty ? (
                <p className="text-sm leading-relaxed text-ink-muted">
                  No clauses matched verified {jurisdictionLabel} rules.
                </p>
              ) : (
                <div className="max-h-[min(16rem,32vh)] overflow-y-auto overscroll-y-contain pr-1">
                  <ul className="space-y-4">
                    {verifiedFindings.map((finding) => (
                      <VerifiedFindingCard
                        key={finding.id}
                        finding={finding}
                        findingId={finding.id}
                        jurisdictionLabel={jurisdictionLabel}
                        isClickable={highlightedIds.has(finding.id)}
                        isHovered={hoveredFindingId === finding.id}
                        onHover={setHoveredFindingId}
                        onSelect={() => scrollToMark(finding.id)}
                      />
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section>
              <DossierSectionHeader title="Other flags" />
              {otherEmpty ? (
                verifiedEmpty ? (
                  <div className="flex items-center gap-3 rounded-lg border border-cleared/30 bg-cleared/[0.06] px-5 py-4 text-sm font-medium text-cleared">
                    <SectionIcon icon={ShieldCheck} className="text-cleared" />
                    No major red flags detected.
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed text-ink-muted">
                    No additional model-flagged clauses beyond verified findings.
                  </p>
                )
              ) : (
                <div className="max-h-[min(16rem,32vh)] overflow-y-auto overscroll-y-contain pr-1">
                  <ul className="space-y-4">
                    {railRedFlags.map(({ flag, index }) => {
                      const flagId = `red-flag-${index}`;
                      return (
                        <OtherFlagCard
                          key={flagId}
                          flag={flag}
                          findingId={flagId}
                          isClickable={highlightedIds.has(flagId)}
                          isHovered={hoveredFindingId === flagId}
                          onHover={setHoveredFindingId}
                          onSelect={() => scrollToMark(flagId)}
                        />
                      );
                    })}
                  </ul>
                </div>
              )}
            </section>

            <div className="flex flex-col items-center gap-6">
              <RiskStamp score={result.risk_score} tone={tone} />
              {hasFindings && (
                <button
                  type="button"
                  onClick={handleDraftLetter}
                  disabled={letterLoading}
                  className="inline-flex w-auto max-w-[13.5rem] items-center justify-center gap-2 rounded-lg border border-stamp/30 bg-stamp/[0.06] px-5 py-3 text-sm font-semibold text-stamp transition-all duration-200 hover:border-stamp/50 hover:bg-stamp/[0.10] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stamp active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {letterLoading ? (
                    <>
                      <Spinner />
                      Drafting letter…
                    </>
                  ) : (
                    <>
                      <SectionIcon icon={PenLine} className="text-stamp" />
                      Draft demand letter
                    </>
                  )}
                </button>
              )}
            </div>

            {letterOpen && (
              <DemandLetterPanel
                letter={letterText}
                error={letterError}
                loading={letterLoading}
                copied={copied}
                onCopy={handleCopyLetter}
              />
            )}
          </aside>
        </div>

        <div className="mt-12 space-y-8">
          <Card title="Summary" icon={ScrollText} staggerMs={150}>
            <p className="text-[15px] leading-relaxed text-ink-muted">
              {result.summary}
            </p>
          </Card>

          {(result.key_terms.length > 0 || result.next_steps.length > 0) && (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:items-stretch">
              {result.key_terms.length > 0 && (
                <div
                  className={`h-full min-w-0 ${
                    result.next_steps.length === 0 ? "md:col-span-2" : ""
                  }`}
                >
                  <Card title="Key Terms Explained" icon={KeyRound} staggerMs={225}>
                    <div className="space-y-4">
                      {result.key_terms.map((item, index) => (
                        <div
                          key={index}
                          className="rounded-lg border border-edge bg-paper p-5"
                        >
                          <p className="font-semibold text-ink">{item.term}</p>
                          <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
                            {item.explanation}
                          </p>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              )}

              {result.next_steps.length > 0 && (
                <div
                  className={`h-full min-w-0 ${
                    result.key_terms.length === 0 ? "md:col-span-2" : ""
                  }`}
                >
                  <Card title="Next Steps" icon={ListChecks} staggerMs={375}>
                    <ul className="space-y-3">
                      {result.next_steps.map((step, index) => (
                        <li key={index} className="flex gap-3">
                          <span
                            aria-hidden
                            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-stamp/25 bg-stamp/[0.08] font-mono text-xs font-bold text-stamp"
                          >
                            {index + 1}
                          </span>
                          <span className="text-[14px] leading-relaxed text-ink-muted">
                            {step}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                </div>
              )}
            </div>
          )}

          {result.deadlines.length > 0 && (
            <Card
              title="Important Deadlines"
              icon={Clock}
              chip="medium"
              staggerMs={300}
            >
              <div className="space-y-5">
                {result.deadlines.map((item, index) => (
                  <div key={index} className="border-l-[3px] border-medium pl-5">
                    <p className="font-semibold text-medium">
                      {item.date_or_timeframe}
                    </p>
                    <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
                      {item.what_happens}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}

function DemandLetterPanel({
  letter,
  error,
  loading,
  copied,
  onCopy,
}: {
  letter: string | null;
  error: string | null;
  loading: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <section className="rounded-lg border border-edge bg-surface p-7 sm:p-8">
      <div className="mb-5 flex items-center justify-between gap-3 border-b border-edge pb-4">
        <h3 className="flex items-center gap-2 text-xs font-semibold text-stamp">
          <SectionIcon icon={FileText} className="text-stamp" size={16} />
          Draft — demand letter
        </h3>
        {letter && !loading && (
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1.5 rounded-md bg-stamp px-3 py-1.5 text-xs font-semibold text-white transition-all duration-200 hover:bg-stamp-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stamp active:scale-[0.98]"
          >
            {copied ? (
              <>
                <SectionIcon icon={Check} size={14} className="text-white" />
                Copied
              </>
            ) : (
              <>
                <SectionIcon icon={Copy} size={14} className="text-white" />
                Copy
              </>
            )}
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-3 py-8">
          <Spinner />
          <p className="text-sm leading-relaxed text-ink-muted">
            Composing letter…
          </p>
        </div>
      )}

      {error && !loading && (
        <p
          role="alert"
          className="rounded-md border border-stamp/25 bg-stamp/[0.06] px-4 py-3 text-sm leading-relaxed text-stamp-deep"
        >
          {error}
        </p>
      )}

      {letter && !loading && !error && (
        <div className="whitespace-pre-wrap font-serif text-[14px] leading-[1.9] text-ink">
          {letter}
        </div>
      )}
    </section>
  );
}

function RiskStamp({
  score,
  tone,
}: {
  score: number;
  tone: ReturnType<typeof riskTone>;
}) {
  return (
    <div
      className={`inline-block -rotate-3 border-[3px] bg-surface p-1 sm:p-1.5 ${tone.border}`}
    >
      <div
        className={`border-2 bg-surface px-7 py-5 text-center font-mono sm:px-9 sm:py-6 ${tone.border} ${tone.text}`}
      >
        <div className="flex items-baseline justify-center gap-1">
          <span className="text-5xl font-bold tabular-nums leading-none sm:text-6xl">
            {score}
          </span>
          <span className="text-base font-semibold opacity-70 sm:text-lg">/10</span>
        </div>
        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] sm:text-sm">
          {tone.label}
        </p>
      </div>
    </div>
  );
}

function DossierSectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xs font-semibold leading-relaxed text-stamp">
        {title}
      </h2>
      <div className="mt-3 border-t border-edge" aria-hidden />
    </div>
  );
}

function VerifiedFindingCard({
  finding,
  findingId,
  jurisdictionLabel,
  isClickable,
  isHovered,
  onHover,
  onSelect,
}: {
  finding: VerifiedFinding;
  findingId: string;
  jurisdictionLabel: string;
  isClickable: boolean;
  isHovered: boolean;
  onHover: (id: string | null) => void;
  onSelect: () => void;
}) {
  const isHighSeverity = finding.severity === "high";
  const ruleColor = isHighSeverity ? "border-l-stamp" : "border-l-medium";

  const body = (
    <>
      <p className="text-xs font-medium text-stamp">
        Verified · {jurisdictionLabel} law
      </p>
      <p className="mt-2 text-sm font-bold leading-snug text-ink">
        {finding.title}
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
        {finding.explanation}
      </p>
      <p className="mt-3 inline-flex items-center gap-1.5 rounded border border-stamp/30 bg-stamp/[0.06] px-2.5 py-1 font-mono text-[10px] text-stamp">
        <SectionIcon icon={Scale} size={14} className="text-stamp" />
        {finding.citation}
      </p>
    </>
  );

  const shellClass = [
    "rounded-r-md border border-edge border-l-4 bg-surface py-4 pl-5 pr-4 transition-all duration-200",
    ruleColor,
    isClickable
      ? isHighSeverity
        ? "cursor-pointer hover:border-stamp hover:-translate-y-0.5 hover:shadow-md"
        : "cursor-pointer hover:border-medium hover:-translate-y-0.5 hover:shadow-md"
      : "",
    isHovered
      ? isHighSeverity
        ? "finding-emphasis border-stamp"
        : "finding-emphasis-medium border-medium"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (!isClickable) {
    return (
      <li className={shellClass} data-finding-card={findingId}>
        {body}
      </li>
    );
  }

  return (
    <li data-finding-card={findingId}>
      <button
        type="button"
        onClick={onSelect}
        onMouseEnter={() => onHover(findingId)}
        onMouseLeave={() => onHover(null)}
        className={`${shellClass} w-full text-left`}
      >
        {body}
      </button>
    </li>
  );
}

function OtherFlagCard({
  flag,
  findingId,
  isClickable,
  isHovered,
  onHover,
  onSelect,
}: {
  flag: ExplainResult["red_flags"][number];
  findingId: string;
  isClickable: boolean;
  isHovered: boolean;
  onHover: (id: string | null) => void;
  onSelect: () => void;
}) {
  const body = (
    <>
      <p className="flex items-start gap-2 text-sm font-medium leading-snug text-ink">
        <SectionIcon icon={Flag} size={16} className="mt-0.5 shrink-0 text-ink-muted" />
        {flag.clause}
      </p>
      <p className="mt-2 pl-6 text-[13px] leading-relaxed text-ink-muted">
        {flag.why}
      </p>
    </>
  );

  const shellClass = [
    "rounded-md border border-edge bg-surface px-5 py-4 transition-all duration-200",
    isClickable
      ? "cursor-pointer hover:border-stamp hover:-translate-y-0.5 hover:shadow-md"
      : "",
    isHovered ? "finding-emphasis border-stamp" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (!isClickable) {
    return (
      <li className={shellClass} data-finding-card={findingId}>
        {body}
      </li>
    );
  }

  return (
    <li data-finding-card={findingId}>
      <button
        type="button"
        onClick={onSelect}
        onMouseEnter={() => onHover(findingId)}
        onMouseLeave={() => onHover(null)}
        className={`${shellClass} w-full text-left`}
      >
        {body}
      </button>
    </li>
  );
}

const CHIPS = {
  default: "border-stamp/20 bg-stamp/5 text-stamp",
  medium: "border-medium/20 bg-medium/10 text-medium",
  stamp: "border-stamp/20 bg-stamp/5 text-stamp",
} as const;

function Card({
  title,
  icon: Icon,
  chip = "default",
  staggerMs = 0,
  children,
}: {
  title: string;
  icon: LucideIcon;
  chip?: keyof typeof CHIPS;
  staggerMs?: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className="animate-fadein flex h-full flex-col rounded-lg border border-edge bg-surface p-7 sm:p-9"
      style={{ animationDelay: `${staggerMs}ms` }}
    >
      <div className="mb-5 flex items-center gap-3">
        <span
          aria-hidden
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded border ${CHIPS[chip]}`}
        >
          <SectionIcon icon={Icon} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-semibold leading-relaxed text-stamp">
            {title}
          </h2>
          <div className="mt-3 border-t border-edge" aria-hidden />
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function Spinner() {
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
