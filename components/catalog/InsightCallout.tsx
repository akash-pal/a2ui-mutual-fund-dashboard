import { z } from "zod3";
import { CommonSchemas, type ComponentApi } from "@a2ui/web_core/v0_9";
import { createComponentImplementation } from "@a2ui/react/v0_9";

export const InsightCalloutPropsSchema = z.object({
  text: CommonSchemas.DataBinding, // always {path}: deterministically templated, never LLM-authored
});

export const InsightCalloutApi: ComponentApi<typeof InsightCalloutPropsSchema> = {
  name: "InsightCallout",
  schema: InsightCalloutPropsSchema,
};

export const InsightCallout = createComponentImplementation(InsightCalloutApi, ({ props }) => {
  return (
    <div className="rounded-md border-l-4 border-blue-500 bg-blue-50 p-3 text-sm text-blue-900">
      {props.text as string}
    </div>
  );
});
