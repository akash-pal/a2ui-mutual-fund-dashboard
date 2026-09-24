import { z } from "zod3";
import { CommonSchemas, type ComponentApi } from "@a2ui/web_core/v0_9";

export const ComparisonTablePropsSchema = z.object({
  title: CommonSchemas.DynamicString,
  columns: z.array(z.string()).min(1),
  rows: CommonSchemas.DataBinding, // always {path}: real values are never literals
});

export const ComparisonTableApi: ComponentApi<typeof ComparisonTablePropsSchema> = {
  name: "ComparisonTable",
  schema: ComparisonTablePropsSchema,
};
