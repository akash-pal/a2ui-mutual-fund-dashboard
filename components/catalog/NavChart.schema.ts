import { z } from "zod3";
import { CommonSchemas, type ComponentApi } from "@a2ui/web_core/v0_9";

export const NavChartPropsSchema = z.object({
  title: CommonSchemas.DynamicString,
  points: CommonSchemas.DataBinding, // always {path}: real numbers are never literals
});

export const NavChartApi: ComponentApi<typeof NavChartPropsSchema> = {
  name: "NavChart",
  schema: NavChartPropsSchema,
};
