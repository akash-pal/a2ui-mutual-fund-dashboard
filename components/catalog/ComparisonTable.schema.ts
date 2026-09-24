import { z } from "zod3";
import { CommonSchemas, type ComponentApi } from "@a2ui/web_core/v0_9";

// `rows` and `columns` use DynamicValue/DynamicStringList, not DataBinding, at the
// *rendering* layer -- see the comment in NavChart.schema.ts for why a bare
// DataBinding is never resolved by the generic binder. `columns` is server-supplied
// (bound to the same deterministic data the rows come from) rather than
// LLM-authored, so a real header count can never drift from the real row width --
// the "always path-bound" rule for both fields is enforced at the LLM-facing
// validation schema in lib/catalog-messages.ts.
export const ComparisonTablePropsSchema = z.object({
  title: CommonSchemas.DynamicString,
  columns: CommonSchemas.DynamicStringList,
  rows: CommonSchemas.DynamicValue,
});

export const ComparisonTableApi: ComponentApi<typeof ComparisonTablePropsSchema> = {
  name: "ComparisonTable",
  schema: ComparisonTablePropsSchema,
};
