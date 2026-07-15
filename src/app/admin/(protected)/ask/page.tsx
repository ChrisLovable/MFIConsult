import AskMfiClient from "./ask-mfi-client";

export const dynamic = "force-dynamic";

export default function AskMfiPage() {
  return (
    <>
      <header className="page-header compact-header ask-v2-page-header">
        <div>
          <span className="eyebrow">MFI staff only</span>
          <h1>Ask MFI</h1>
          <p>
            Ask open-ended questions across verified billing,
            collection, invoice and submission records.
          </p>
        </div>
      </header>

      <AskMfiClient />
    </>
  );
}
