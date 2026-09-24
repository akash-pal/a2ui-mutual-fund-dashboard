"use client";

import { useState } from "react";
import { QueryInput } from "@/components/QueryInput";
import { A2UISurfaceList } from "@/components/A2UISurface";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import type { A2uiMessage } from "@/lib/catalog";

export default function Home() {
  const [messages, setMessages] = useState<A2uiMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Forces the ErrorBoundary to remount (clearing any previous render error)
  // whenever a new query's response arrives, rather than staying stuck on a
  // prior error forever.
  const [queryCount, setQueryCount] = useState(0);

  async function handleSubmit(query: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed: ${res.status}`);
      }
      const body = await res.json();
      setMessages(body.messages);
      setQueryCount((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">Mutual Fund Dashboard</h1>
      <QueryInput onSubmit={handleSubmit} disabled={loading} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ErrorBoundary
        key={queryCount}
        fallback={() => (
          <p className="text-sm text-red-600">
            Something went wrong rendering this result. Try asking again.
          </p>
        )}
      >
        <A2UISurfaceList messages={messages} />
      </ErrorBoundary>
    </main>
  );
}
