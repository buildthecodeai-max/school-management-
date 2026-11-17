"use client";

import Link from "next/link";
import { useTransition } from "react";
import { dismissBreachWarning } from "@/app/portal/account/password/actions";

export function BreachWarningBanner() {
  const [pending, startTransition] = useTransition();

  function handleDismiss() {
    startTransition(async () => {
      await dismissBreachWarning();
    });
  }

  if (pending) return null;

  return (
    <div className="flex items-center justify-between gap-4 bg-amber-500 px-6 py-2 text-sm font-medium text-white">
      <span>
        Your password has appeared in a known data breach.{" "}
        <Link href="/portal/account/password" className="underline">
          Change it now
        </Link>{" "}
        to keep your account secure.
      </span>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss breach warning"
        className="shrink-0 rounded px-2 py-0.5 text-xs hover:bg-amber-600"
      >
        Dismiss
      </button>
    </div>
  );
}
