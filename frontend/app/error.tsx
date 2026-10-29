"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="shell flex min-h-[60vh] items-center py-16">
      <div className="w-full max-w-xl">
        <p className="label">500 · unexpected error</p>
        <h1 className="display mt-4 text-[clamp(40px,6vw,64px)] text-ink">
          This page failed to load.
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
          This was an app-side error, not an on-chain transaction. No funds moved
          because of this error. Try reloading this section; if it still fails, head
          back to the home page.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button size="lg" onClick={() => retry()}>
            <RefreshCw className="size-4" />
            Try again
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/">
              <ArrowLeft className="size-4" />
              Go home
            </Link>
          </Button>
        </div>

        {error.message && (
          <details className="mt-8 rounded-lg border border-border bg-card p-4">
            <summary className="cursor-pointer font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              Technical details
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-muted-foreground">
              {error.message}
              {error.digest ? `\n\ndigest: ${error.digest}` : ""}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
