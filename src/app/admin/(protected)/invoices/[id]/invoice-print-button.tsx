"use client";

export default function InvoicePrintButton() {
  return (
    <button
      type="button"
      className="secondary-button invoice-print-button"
      onClick={() => window.print()}
    >
      Print invoice
    </button>
  );
}
