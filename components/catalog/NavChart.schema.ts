import { z } from "zod3";
import { CommonSchemas, type ComponentApi } from "@a2ui/web_core/v0_9";

// `points` uses DynamicValue, not DataBinding, at the *rendering* layer: the A2UI
// generic binder only resolves a {path} reference when the field's schema is a
// ZodUnion (as DynamicString/DynamicValue are) -- a bare DataBinding ZodObject is
// classified as a static nested object and never resolved, so the component would
// receive the literal {path: "..."} instead of the bound array. The "always
// path-bound, never literal" rule is still enforced -- just at the LLM-facing
// validation schema in lib/catalog-messages.ts, not here.
export const NavChartPropsSchema = z.object({
  title: CommonSchemas.DynamicString,
  points: CommonSchemas.DynamicValue,
});

export const NavChartApi: ComponentApi<typeof NavChartPropsSchema> = {
  name: "NavChart",
  schema: NavChartPropsSchema,
};
