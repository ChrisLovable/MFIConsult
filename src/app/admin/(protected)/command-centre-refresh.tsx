"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function CommandCentreRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="secondary-button command-refresh-button"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      {pending ? "Refreshing..." : "Refresh data"}
    </button>
  );
}
