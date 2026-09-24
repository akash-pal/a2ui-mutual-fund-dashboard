import { z } from "zod3";
import { CommonSchemas, type ComponentApi } from "@a2ui/web_core/v0_9";

// `items` uses DynamicValue, not DataBinding, at the *rendering* layer -- see the
// comment in NavChart.schema.ts for why a bare DataBinding is never resolved by
// the generic binder. The "always path-bound" rule is still enforced at the
// LLM-facing validation schema in lib/catalog-messages.ts.
export const RankedListPropsSchema = z.object({
  title: CommonSchemas.DynamicString,
  items: CommonSchemas.DynamicValue,
});

export const RankedListApi: ComponentApi<typeof RankedListPropsSchema> = {
  name: "RankedList",
  schema: RankedListPropsSchema,
};
