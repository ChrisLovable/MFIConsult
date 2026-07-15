"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

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

const moneyTotalKeys = new Set([
  "invoiced",
  "paid",
  "outstanding",
  "overdue",
  "value",
]);

function numericValue(
  value: string | number | null,
): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const compact = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\s/g, "");

  const normalized =
    compact.includes(",") &&
    compact.lastIndexOf(",") >
      compact.lastIndexOf(".")
      ? compact
          .replace(/\./g, "")
          .replace(",", ".")
      : compact.replace(/,/g, "");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTotal(
  key: string,
  value: number,
): string {
  if (moneyTotalKeys.has(key.toLowerCase())) {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      maximumFractionDigits: 0,
    }).format(value);
  }

  return value.toLocaleString("en-ZA");
}

function humanLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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
        ["Doctor", "Payer", "Practice", "Period"].includes(
          column,
        ),
      ) || columns[0];

    const metric =
      preferredChartMetrics.find((candidate) =>
        columns.includes(candidate),
      ) ||
      columns.find((column) =>
        rows.some(
          (row) => numericValue(row[column]) > 0,
        ),
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

    return {
      metric,
      values,
      maximum: Math.max(
        1,
        ...values.map((item) => item.value),
      ),
    };
  }, [rows]);

  if (!chart || !chart.values.length) {
    return (
      <section className="ask-v2-panel ask-v2-chart-panel">
        <span className="eyebrow">Automatic visual</span>
        <h3>No chart required</h3>
        <p>
          This answer is best represented by the verified
          result table.
        </p>
      </section>
    );
  }

  return (
    <section
      className="ask-v2-panel ask-v2-chart-panel"
      aria-label={`${chart.metric} chart`}
    >
      <div className="ask-v2-panel-heading">
        <div>
          <span className="eyebrow">
            Automatic visual
          </span>
          <h3>{chart.metric} comparison</h3>
        </div>
        <span className="ask-v2-mini-badge">
          Top {chart.values.length}
        </span>
      </div>

      <div className="ask-v2-bars">
        {chart.values.map((item) => (
          <div
            className="ask-v2-bar-row"
            key={`${item.label}-${item.display}`}
          >
            <span title={item.label}>
              {item.label}
            </span>

            <div className="ask-v2-bar-track">
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

function KeyMetrics({
  result,
}: {
  result: AskResult;
}) {
  const totals = Object.entries(result.totals);

  return (
    <section className="ask-v2-panel ask-v2-metrics-panel">
      <div className="ask-v2-panel-heading">
        <div>
          <span className="eyebrow">
            Verified key figures
          </span>
          <h3>At a glance</h3>
        </div>
      </div>

      <div className="ask-v2-metric-grid">
        <article>
          <span>Results</span>
          <strong>
            {result.rows.length.toLocaleString("en-ZA")}
          </strong>
        </article>

        {totals.slice(0, 5).map(([key, value]) => (
          <article key={key}>
            <span>{humanLabel(key)}</span>
            <strong>{formatTotal(key, value)}</strong>
          </article>
        ))}
      </div>

      <details className="ask-v2-evidence">
        <summary>Show how this was calculated</summary>

        <div className="ask-v2-evidence-body">
          <dl>
            <div>
              <dt>Analysis</dt>
              <dd>{humanLabel(result.plan.intent)}</dd>
            </div>
            <div>
              <dt>Period</dt>
              <dd>
                {result.plan.from} to {result.plan.to}
              </dd>
            </div>
            <div>
              <dt>Threshold</dt>
              <dd>
                {result.plan.threshold > 0
                  ? new Intl.NumberFormat("en-ZA", {
                      style: "currency",
                      currency: "ZAR",
                      maximumFractionDigits: 0,
                    }).format(result.plan.threshold)
                  : "None"}
              </dd>
            </div>
          </dl>

          <p>{result.verification}</p>
        </div>
      </details>
    </section>
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
    <div className="ask-v2-result">
      <section className="content-card ask-v2-answer-card">
        <div className="ask-v2-answer-heading">
          <div>
            <span className="eyebrow">
              Intelligent verified answer
            </span>
            <h2>MFI analysis</h2>
          </div>

          <span className="ask-v2-period">
            {result.plan.from} to {result.plan.to}
          </span>
        </div>

        <div className="ask-v2-answer-copy">
          {result.answer
            .split(/\n+/)
            .filter(Boolean)
            .map((paragraph, index) => (
              <p key={`${index}-${paragraph}`}>
                {paragraph}
              </p>
            ))}
        </div>
      </section>

      <div className="ask-v2-insight-grid">
        <AskChart rows={result.rows} />
        <KeyMetrics result={result} />
      </div>

      <section className="content-card ask-v2-results-card">
        <div className="ask-v2-results-heading">
          <div>
            <span className="eyebrow">
              Supporting database records
            </span>
            <h2>Verified results</h2>
          </div>

          <span className="count-pill">
            {result.rows.length}{" "}
            {result.rows.length === 1
              ? "result"
              : "results"}
          </span>
        </div>

        {result.rows.length ? (
          <div className="ask-v2-table-wrap">
            <table className="ask-v2-table">
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
  const [question, setQuestion] = useState(
    suggestions[0],
  );
  const [threads, setThreads] = useState<AskThread[]>(
    [],
  );
  const [threadSearch, setThreadSearch] = useState("");
  const [activeThreadId, setActiveThreadId] = useState<
    string | null
  >(null);
  const [messages, setMessages] = useState<
    StoredMessage[]
  >([]);
  const [latestResult, setLatestResult] =
    useState<AskResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] =
    useState(true);

  const filteredThreads = useMemo(() => {
    const search = threadSearch.trim().toLowerCase();

    if (!search) {
      return threads;
    }

    return threads.filter((thread) =>
      thread.title.toLowerCase().includes(search),
    );
  }, [threadSearch, threads]);

  async function loadThreads() {
    try {
      const response = await fetch(
        "/api/admin/ask/threads",
        {
          cache: "no-store",
        },
      );

      const data = (await response.json()) as {
        threads?: AskThread[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Conversation history could not be loaded.",
        );
      }

      setThreads(data.threads ?? []);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Conversation history could not be loaded.",
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
        `/api/admin/ask/threads/${encodeURIComponent(
          threadId,
        )}`,
        {
          cache: "no-store",
        },
      );

      const data = (await response.json()) as {
        thread?: AskThread;
        messages?: StoredMessage[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error ||
            "The conversation could not be loaded.",
        );
      }

      const loadedMessages = data.messages ?? [];

      setActiveThreadId(threadId);
      setMessages(loadedMessages);

      const finalAnswer = [...loadedMessages]
        .reverse()
        .map(resultFromMessage)
        .find(
          (
            result,
          ): result is AskResult => result !== null,
        );

      setLatestResult(finalAnswer ?? null);
      setQuestion("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The conversation could not be loaded.",
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
    <div className="ask-v2-workspace">
      <aside className="ask-v2-thread-rail">
        <div className="ask-v2-thread-header">
          <div>
            <span className="eyebrow">
              Saved analysis
            </span>
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

        <label className="ask-v2-thread-search">
          <span className="sr-only">
            Search conversations
          </span>
          <input
            type="search"
            value={threadSearch}
            onChange={(event) =>
              setThreadSearch(event.target.value)
            }
            placeholder="Search conversations"
          />
        </label>

        {historyLoading && !threads.length ? (
          <p className="ask-v2-muted">
            Loading history…
          </p>
        ) : filteredThreads.length ? (
          <div className="ask-v2-thread-list">
            {filteredThreads.map((thread) => (
              <button
                type="button"
                key={thread.id}
                className={
                  thread.id === activeThreadId
                    ? "is-active"
                    : undefined
                }
                onClick={() =>
                  void openThread(thread.id)
                }
              >
                <strong>{thread.title}</strong>
                <small>
                  {dateTimeLabel(thread.updatedAt)}
                </small>
              </button>
            ))}
          </div>
        ) : (
          <p className="ask-v2-muted">
            No saved conversations match.
          </p>
        )}
      </aside>

      <main className="ask-v2-main">
        <section className="content-card ask-v2-composer">
          <div className="ask-v2-composer-heading">
            <div>
              <span className="eyebrow">
                Natural-language financial intelligence
              </span>
              <h2>
                {activeThreadId
                  ? "Ask a follow-up"
                  : "Ask the MFI database"}
              </h2>
              <p>
                AI interprets the question. Every doctor,
                amount and result is calculated from stored
                MFI records.
              </p>
            </div>

            {activeThreadId ? (
              <span className="ask-v2-active-thread">
                Active conversation
              </span>
            ) : null}
          </div>

          <form onSubmit={submitQuestion}>
            <textarea
              value={question}
              onChange={(event) =>
                setQuestion(event.target.value)
              }
              maxLength={500}
              rows={3}
              placeholder={
                activeThreadId
                  ? "Ask a follow-up, for example: Which of those doctors still owe money?"
                  : "Ask a financial question in normal language."
              }
            />

            <div className="ask-v2-composer-footer">
              <small>{question.length}/500</small>

              <button
                type="submit"
                className="primary-button"
                disabled={loading}
              >
                {loading
                  ? "Analysing records..."
                  : activeThreadId
                    ? "Ask follow-up"
                    : "Ask MFI"}
              </button>
            </div>
          </form>

          {error ? (
            <div className="error-banner ask-v2-error">
              {error}
            </div>
          ) : null}

          {!activeThreadId ? (
            <div className="ask-v2-suggestions">
              {suggestions.map((suggestion) => (
                <button
                  type="button"
                  key={suggestion}
                  onClick={() =>
                    setQuestion(suggestion)
                  }
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        {latestResult ? (
          <VerifiedResult result={latestResult} />
        ) : (
          <section className="content-card ask-v2-empty-workspace">
            <span className="eyebrow">
              Ready for analysis
            </span>
            <h2>
              Ask what happened, where the money is,
              and what needs attention.
            </h2>
            <p>
              Results will appear here as a verified
              executive answer, chart, key figures and
              supporting records.
            </p>
          </section>
        )}

        {messages.length ? (
          <details className="content-card ask-v2-transcript">
            <summary>
              Conversation history ({messages.length})
            </summary>

            <div className="ask-v2-message-list">
              {messages.map((message) => (
                <article
                  className={`ask-v2-message ${message.role}`}
                  key={message.id}
                >
                  <span>
                    {message.role === "user"
                      ? "You"
                      : "MFI"}
                  </span>
                  <p>{message.content}</p>
                </article>
              ))}
            </div>
          </details>
        ) : null}
      </main>
    </div>
  );
}
