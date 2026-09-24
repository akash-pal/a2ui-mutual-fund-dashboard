"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageProcessor, type SurfaceModel } from "@a2ui/web_core/v0_9";
import { A2uiSurface, type ReactComponentImplementation } from "@a2ui/react/v0_9";
import { appCatalog, type A2uiMessage } from "@/lib/catalog";

export function A2UISurfaceList({ messages }: { messages: A2uiMessage[] }) {
  const processor = useMemo(() => new MessageProcessor([appCatalog]), []);
  const [surfaces, setSurfaces] = useState<SurfaceModel<ReactComponentImplementation>[]>([]);

  useEffect(() => {
    const createdSub = processor.onSurfaceCreated(() => {
      setSurfaces(Array.from(processor.model.surfacesMap.values()) as SurfaceModel<ReactComponentImplementation>[]);
    });
    const deletedSub = processor.onSurfaceDeleted(() => {
      setSurfaces(Array.from(processor.model.surfacesMap.values()) as SurfaceModel<ReactComponentImplementation>[]);
    });
    return () => {
      createdSub.unsubscribe();
      deletedSub.unsubscribe();
    };
  }, [processor]);

  useEffect(() => {
    if (messages.length > 0) {
      processor.processMessages(messages as never);
    }
  }, [processor, messages]);

  return (
    <div className="flex flex-col gap-4">
      {surfaces.map((surface) => (
        <A2uiSurface key={surface.id} surface={surface} />
      ))}
    </div>
  );
}
