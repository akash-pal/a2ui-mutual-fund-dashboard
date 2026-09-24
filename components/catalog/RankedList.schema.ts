import { z } from "zod3";
import { CommonSchemas, type ComponentApi } from "@a2ui/web_core/v0_9";

export const RankedListPropsSchema = z.object({
  title: CommonSchemas.DynamicString,
  items: CommonSchemas.DataBinding, // always {path}: real values are never literals
});

export const RankedListApi: ComponentApi<typeof RankedListPropsSchema> = {
  name: "RankedList",
  schema: RankedListPropsSchema,
};
