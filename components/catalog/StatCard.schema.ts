import { z } from "zod3";
import { CommonSchemas, type ComponentApi } from "@a2ui/web_core/v0_9";

export const StatCardPropsSchema = z.object({
  label: CommonSchemas.DynamicString,
  value: CommonSchemas.DynamicString,
  trend: CommonSchemas.DynamicString.optional(),
});

export const StatCardApi: ComponentApi<typeof StatCardPropsSchema> = {
  name: "StatCard",
  schema: StatCardPropsSchema,
};
