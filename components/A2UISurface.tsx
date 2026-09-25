"use client";

import { useEffect, useState } from "react";
import { MessageProcessor, type SurfaceModel } from "@a2ui/web_core/v0_9";
import { A2uiSurface, type ReactComponentImplementation } from "@a2ui/react/v0_9";
import { appCatalog, type A2uiMessage } from "@/lib/catalog";

export function A2UISurfaceList({ messages }: { messages: A2uiMessage[] }) {
  const [surfaces, setSurfaces] = useState<SurfaceModel<ReactComponentImplementation>[]>([]);

  // The processor is created and consumed entirely within one effect (not a
  // separate useMemo) so React Strict Mode's dev-only double-invoke of effects
  // (mount -> simulated unmount -> mount again) gives each invocation its own
  // fully isolated processor instance. The previous split (processor via useMemo,
  // processMessages in a separate effect) let Strict Mode's second effect
  // invocation call processMessages again on the SAME memoized processor, which
  // already had every surface from the first invocation -- MessageProcessor throws
  // "Surface already exists" rather than silently no-op-ing, crashing every single
  // query in dev mode (reproduced live: this is a real, dev-mode-only regression
  // from giving each query's <ErrorBoundary> a fresh `key`, which remounts this
  // component on every query, not just once per page load).
  useEffect(() => {
    // messages only ever grows from the initial [] once a query succeeds (see
    // app/page.tsx) -- it's never reset back to empty, so there's no case where
    // `surfaces` (already [] from useState) needs clearing here.
    if (messages.length === 0) return;
    const processor = new MessageProcessor([appCatalog]);
    const createdSub = processor.onSurfaceCreated(() => {
      setSurfaces(Array.from(processor.model.surfacesMap.values()) as SurfaceModel<ReactComponentImplementation>[]);
    });
    const deletedSub = processor.onSurfaceDeleted(() => {
      setSurfaces(Array.from(processor.model.surfacesMap.values()) as SurfaceModel<ReactComponentImplementation>[]);
    });
    processor.processMessages(messages as never);
    return () => {
      createdSub.unsubscribe();
      deletedSub.unsubscribe();
    };
  }, [messages]);

  return (
    <div className="flex flex-col gap-4">
      {surfaces.map((surface) => (
        <A2uiSurface key={surface.id} surface={surface} />
      ))}
    </div>
  );
}
