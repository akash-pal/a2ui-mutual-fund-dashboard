import { z } from "zod3";
import { CommonSchemas, type ComponentApi } from "@a2ui/web_core/v0_9";

// `text` uses DynamicString, not DataBinding, at the *rendering* layer -- see the
// comment in NavChart.schema.ts for why a bare DataBinding is never resolved by
// the generic binder. The "always path-bound, never LLM-authored" rule is still
// enforced at the LLM-facing validation schema in lib/catalog-messages.ts.
export const InsightCalloutPropsSchema = z.object({
  text: CommonSchemas.DynamicString,
});

export const InsightCalloutApi: ComponentApi<typeof InsightCalloutPropsSchema> = {
  name: "InsightCallout",
  schema: InsightCalloutPropsSchema,
};
