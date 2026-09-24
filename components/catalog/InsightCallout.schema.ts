import { z } from "zod3";
import { CommonSchemas, type ComponentApi } from "@a2ui/web_core/v0_9";

export const InsightCalloutPropsSchema = z.object({
  text: CommonSchemas.DataBinding, // always {path}: deterministically templated, never LLM-authored
});

export const InsightCalloutApi: ComponentApi<typeof InsightCalloutPropsSchema> = {
  name: "InsightCallout",
  schema: InsightCalloutPropsSchema,
};
