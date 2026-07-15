"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

interface AskPlan {
  intent: string;
  from: string;
  to: string;
  threshold: number;
  explanation?: string;
}

interface AskResult {
  question: string;
  answer: string;
  plan: AskPlan;
  rows: Array<Record<string, string | number | null>>;
  totals: Record<string, number>;
  verification: string;
  threadId: string;
}

interface AskThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  plan: AskPlan | null;
  rows: Array<Record<string, string | number | null>>;
  totals: Record<string, number>;
  verification: string | null;
  createdAt: string;
}

const suggestions = [
  "Show all doctors billed more than R10,000 last month.",
  "Which doctors have the highest overdue balances?",
  "Compare invoiced, paid and outstanding amounts this month.",
  "Show doctors with consultations ready to invoice.",
  "Which doctors have the lowest collection rates this quarter?",
  "Which payers owe MFI the most?",
];

const preferredChartMetrics = [
  "Outstanding",
  "Invoiced",
  "Paid",
  "Overdue",
  "Value",
  "Records",
  "Invoices",
];

function numericValue(value: string | number | null): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\s/g, "")
    .replace(/,(?=\d{2}$)/, ".")
    .replace(/,/g, "");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resultFromMessage(
  message: StoredMessage,
): AskResult | null {
  if (
    message.role !== "assistant" ||
    !message.plan ||
    !message.verification
  ) {
    return null;
  }

  return {
    question: "",
    answer: message.content,
    plan: message.plan,
    rows: message.rows,
    totals: message.totals,
    verification: message.verification,
    threadId: message.threadId,
  };
}

function dateTimeLabel(value: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function AskChart({
  rows,
}: {
  rows: Array<Record<string, string | number | null>>;
}) {
  const chart = useMemo(() => {
    if (!rows.length) {
      return null;
    }

    const columns = Object.keys(rows[0]);
    const labelColumn =
      columns.find((column) =>
        ["Doctor", "Payer", "Practice", "Period"].includes(column),
      ) || columns[0];

    const metric =
      preferredChartMetrics.find((candidate) =>
        columns.includes(candidate),
      ) ||
      columns.find((column) =>
        rows.some((row) => numericValue(row[column]) > 0),
      );

    if (!metric) {
      return null;
    }

    const values = rows
      .slice(0, 8)
      .map((row) => ({
        label: String(row[labelColumn] ?? "Result"),
        display: String(row[metric] ?? "0"),
        value: numericValue(row[metric]),
      }))
      .filter((item) => item.value >= 0);

    const maximum = Math.max(
      1,
      ...values.map((item) => item.value),
    );

    return {
      metric,
      values,
      maximum,
    };
  }, [rows]);

  if (!chart || !chart.values.length) {
    return null;
  }

  return (
    <section className="ask-command-chart" aria-label={`${chart.metric} chart`}>
      <div className="ask-command-section-heading">
        <div>
          <span className="eyebrow">Automatic visual</span>
          <h3>{chart.metric} comparison</h3>
        </div>
      </div>

      <div className="ask-command-bars">
        {chart.values.map((item) => (
          <div className="ask-command-bar-row" key={`${item.label}-${item.display}`}>
            <span title={item.label}>{item.label}</span>
            <div className="ask-command-bar-track">
              <i
                style={{
                  width: `${Math.max(
                    item.value > 0 ? 4 : 0,
                    (item.value / chart.maximum) * 100,
                  )}%`,
                }}
              />
            </div>
            <strong>{item.display}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function AnswerEvidence({
  result,
}: {
  result: AskResult;
}) {
  const totalEntries = Object.entries(result.totals);

  return (
    <details className="ask-command-evidence">
      <summary>Show how this was calculated</summary>

      <div className="ask-command-evidence-grid">
        <div>
          <span>Analysis type</span>
          <strong>{result.plan.intent.replace(/_/g, " ")}</strong>
        </div>
        <div>
          <span>Period</span>
          <strong>
            {result.plan.from} to {result.plan.to}
          </strong>
        </div>
        <div>
          <span>Threshold</span>
          <strong>
            {result.plan.threshold > 0
              ? `R ${result.plan.threshold.toLocaleString("en-ZA")}`
              : "None"}
          </strong>
        </div>
        <div>
          <span>Matching rows</span>
          <strong>{result.rows.length}</strong>
        </div>
        {totalEntries.map(([key, value]) => (
          <div key={key}>
            <span>{key.replace(/([A-Z])/g, " $1")}</span>
            <strong>{value.toLocaleString("en-ZA")}</strong>
          </div>
        ))}
      </div>

      <p>{result.verification}</p>
    </details>
  );
}

function VerifiedResult({
  result,
}: {
  result: AskResult;
}) {
  const columns = result.rows.length
    ? Object.keys(result.rows[0])
    : [];

  return (
    <div className="ask-command-result">
      <section className="content-card ask-mfi-answer-card">
        <div className="ask-mfi-answer-heading">
          <div>
            <span className="eyebrow">
              Intelligent verified answer
            </span>
            <h2>MFI analysis</h2>
          </div>

          <span className="count-pill">
            {result.plan.from} to {result.plan.to}
          </span>
        </div>

        <div className="ask-mfi-answer">
          {result.answer
            .split(/\n+/)
            .filter(Boolean)
            .map((paragraph, index) => (
              <p key={`${index}-${paragraph}`}>
                {paragraph}
              </p>
            ))}
        </div>

        <AnswerEvidence result={result} />
      </section>

      <AskChart rows={result.rows} />

      <section className="content-card ask-mfi-results-card">
        <div className="card-heading financial-heading">
          <div>
            <span className="eyebrow">
              Supporting database records
            </span>
            <h2>Verified results</h2>
          </div>

          <span className="count-pill">
            {result.rows.length} verified{" "}
            {result.rows.length === 1 ? "result" : "results"}
          </span>
        </div>

        {result.rows.length ? (
          <div className="ask-mfi-table-wrap">
            <table className="ask-mfi-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {result.rows.map((row, index) => (
                  <tr key={index}>
                    {columns.map((column) => (
                      <td key={column}>
                        {String(row[column] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            No matching database records were found.
          </div>
        )}
      </section>
    </div>
  );
}

export default function AskMfiClient() {
  const [question, setQuestion] = useState(suggestions[0]);
  const [threads, setThreads] = useState<AskThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    null,
  );
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [latestResult, setLatestResult] = useState<AskResult | null>(
    null,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);

  async function loadThreads() {
    try {
      const response = await fetch("/api/admin/ask/threads", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        threads?: AskThread[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "History could not be loaded.");
      }

      setThreads(data.threads ?? []);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "History could not be loaded.",
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openThread(threadId: string) {
    setHistoryLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/admin/ask/threads/${encodeURIComponent(threadId)}`,
        { cache: "no-store" },
      );

      const data = (await response.json()) as {
        thread?: AskThread;
        messages?: StoredMessage[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Conversation could not be loaded.");
      }

      const loadedMessages = data.messages ?? [];
      setActiveThreadId(threadId);
      setMessages(loadedMessages);

      const finalAnswer = [...loadedMessages]
        .reverse()
        .map(resultFromMessage)
        .find(Boolean);

      setLatestResult(finalAnswer ?? null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Conversation could not be loaded.",
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  function startNewConversation() {
    setActiveThreadId(null);
    setMessages([]);
    setLatestResult(null);
    setError("");
    setQuestion(suggestions[0]);
  }

  useEffect(() => {
    void loadThreads();
  }, []);

  async function submitQuestion(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const cleanQuestion = question.trim();

    if (!cleanQuestion) {
      setError("Enter a question.");
      return;
    }

    setLoading(true);
    setError("");

    const temporaryUserMessage: StoredMessage = {
      id: `pending-${Date.now()}`,
      threadId: activeThreadId ?? "",
      role: "user",
      content: cleanQuestion,
      plan: null,
      rows: [],
      totals: {},
      verification: null,
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, temporaryUserMessage]);

    try {
      const response = await fetch("/api/admin/ask", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          question: cleanQuestion,
          threadId: activeThreadId,
        }),
      });

      const data = (await response.json()) as
        | AskResult
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in data && data.error
            ? data.error
            : "The analysis failed.",
        );
      }

      const result = data as AskResult;
      setActiveThreadId(result.threadId);
      setLatestResult(result);
      setQuestion("");

      await Promise.all([
        openThread(result.threadId),
        loadThreads(),
      ]);
    } catch (requestError) {
      setMessages((current) =>
        current.filter((message) => message.id !== temporaryUserMessage.id),
      );
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The analysis failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ask-command-layout">
      <aside className="content-card ask-command-history">
        <div className="ask-command-history-heading">
          <div>
            <span className="eyebrow">Saved analysis</span>
            <h2>Conversations</h2>
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={startNewConversation}
          >
            New
          </button>
        </div>

        {historyLoading && !threads.length ? (
          <p className="ask-command-muted">Loading history…</p>
        ) : threads.length ? (
          <div className="ask-command-thread-list">
            {threads.map((thread) => (
              <button
                type="button"
                key={thread.id}
                className={
                  thread.id === activeThreadId ? "is-active" : undefined
                }
                onClick={() => void openThread(thread.id)}
              >
                <strong>{thread.title}</strong>
                <small>{dateTimeLabel(thread.updatedAt)}</small>
              </button>
            ))}
          </div>
        ) : (
          <p className="ask-command-muted">
            Your verified MFI analyses will appear here.
          </p>
        )}
      </aside>

      <div className="ask-command-main">
        {messages.length ? (
          <section className="content-card ask-command-conversation">
            <div className="ask-command-section-heading">
              <div>
                <span className="eyebrow">Follow-up context</span>
                <h2>Current conversation</h2>
              </div>
            </div>

            <div className="ask-command-message-list">
              {messages.map((message) => (
                <article
                  className={`ask-command-message ${message.role}`}
                  key={message.id}
                >
                  <span>
                    {message.role === "user" ? "You" : "MFI"}
                  </span>
                  <p>{message.content}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="content-card ask-mfi-question-card">
          <span className="eyebrow">
            Natural-language financial intelligence
          </span>
          <h2>
            {activeThreadId
              ? "Ask a follow-up question"
              : "Ask the MFI database"}
          </h2>
          <p>
            Every name and financial amount is calculated from stored
            database records. The conversation and its evidence are saved
            for MFI staff.
          </p>

          <form onSubmit={submitQuestion}>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Example: Which of those doctors still have outstanding balances?"
            />

            <div className="ask-mfi-form-footer">
              <small>{question.length}/500</small>

              <button
                type="submit"
                className="primary-button"
                disabled={loading}
              >
                {loading
                  ? "Analysing verified records..."
                  : activeThreadId
                    ? "Ask follow-up"
                    : "Ask MFI"}
              </button>
            </div>
          </form>

          {error ? (
            <div className="error-banner ask-mfi-error">
              {error}
            </div>
          ) : null}

          {!activeThreadId ? (
            <div className="ask-mfi-suggestions">
              <span>Suggested questions</span>
              <div>
                {suggestions.map((suggestion) => (
                  <button
                    type="button"
                    key={suggestion}
                    onClick={() => setQuestion(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {latestResult ? <VerifiedResult result={latestResult} /> : null}
      </div>
    </div>
  );
}
