"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

interface FinancialPeriodFilterProps {
  doctorId: string;
  from: string;
  to: string;
}

export default function FinancialPeriodFilter({
  doctorId,
  from,
  to,
}: FinancialPeriodFilterProps) {
  const router = useRouter();
  const [startDate, setStartDate] = useState(from);
  const [endDate, setEndDate] = useState(to);
  const [error, setError] = useState("");

  function applyPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!startDate || !endDate) {
      setError("Select both dates.");
      return;
    }

    if (startDate > endDate) {
      setError("The From date cannot be after the To date.");
      return;
    }

    const query = new URLSearchParams({
      from: startDate,
      to: endDate,
    });

    router.push(
      `/admin/doctors/${encodeURIComponent(
        doctorId,
      )}/financial?${query.toString()}`,
    );
  }

  return (
    <form
      className="financial-date-filter"
      onSubmit={applyPeriod}
    >
      <label>
        <span>From</span>
        <input
          type="date"
          name="from"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          required
        />
      </label>

      <label>
        <span>To</span>
        <input
          type="date"
          name="to"
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
          required
        />
      </label>

      <button type="submit" className="secondary-button">
        Apply period
      </button>

      {error ? (
        <span
          role="alert"
          style={{
            color: "#b42318",
            fontSize: "12px",
            fontWeight: 700,
          }}
        >
          {error}
        </span>
      ) : null}
    </form>
  );
}
