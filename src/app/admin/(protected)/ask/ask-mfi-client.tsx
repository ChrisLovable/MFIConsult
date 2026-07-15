"use client";

import { useState } from "react";

interface AskResult {
  question: string;
  answer: string;
  plan: {
    intent: string;
    from: string;
    to: string;
    threshold: number;
    explanation: string;
  };
  rows: Array<Record<string, string | number | null>>;
  totals: Record<string, number>;
  verification: string;
}

const suggestions = [
  "Show all doctors billed more than R10,000 last month.",
  "Which doctors have the highest overdue balances?",
  "Compare invoiced, paid and outstanding amounts this month.",
  "Show doctors with consultations ready to invoice.",
  "Which doctors have the lowest collection rates this quarter?",
  "Which payers owe MFI the most?",
];

export default function AskMfiClient() {
  const [question, setQuestion] = useState(
    suggestions[0],
  );
  const [result, setResult] = useState<AskResult | null>(
    null,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitQuestion(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const cleanQuestion = question.trim();

    if (!cleanQuestion) {
      setError("Enter a question.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/admin/ask", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          question: cleanQuestion,
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

      setResult(data as AskResult);
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

  const columns =
    result && result.rows.length
      ? Object.keys(result.rows[0])
      : [];

  return (
    <div className="ask-mfi-layout">
      <section className="content-card ask-mfi-question-card">
        <span className="eyebrow">
          Natural-language financial intelligence
        </span>
        <h2>Ask the MFI database</h2>
        <p>
          Ask an open-ended management question. AI interprets
          the question, but every name and amount comes from
          verified database records.
        </p>

        <form onSubmit={submitQuestion}>
          <textarea
            value={question}
            onChange={(event) =>
              setQuestion(event.target.value)
            }
            maxLength={500}
            rows={4}
            placeholder="Example: Show all doctors billed more than R10,000 last month."
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
                : "Ask MFI"}
            </button>
          </div>
        </form>

        {error ? (
          <div className="error-banner ask-mfi-error">
            {error}
          </div>
        ) : null}

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
      </section>

      {result ? (
        <>
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
                  <p
                    key={`${index}-${paragraph}`}
                    className={
                      index === 0
                        ? "ask-mfi-answer-lead"
                        : undefined
                    }
                  >
                    {paragraph}
                  </p>
                ))}
            </div>

            <div className="summary-trust-note">
              {result.verification}
            </div>
          </section>

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
                {result.rows.length === 1
                  ? "result"
                  : "results"}
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
                            {String(row[column] ?? "Ã¢â‚¬â€")}
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
        </>
      ) : null}
    </div>
  );
}
