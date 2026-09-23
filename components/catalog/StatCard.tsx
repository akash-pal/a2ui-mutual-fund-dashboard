import { CommonSchemas, type ComponentApi } from "@a2ui/web_core/v0_9";
import { createComponentImplementation } from "@a2ui/react/v0_9";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const StatCardPropsSchema = CommonSchemas.AnyComponent.extend({
  label: CommonSchemas.DynamicString,
  value: CommonSchemas.DynamicString,
  trend: CommonSchemas.DynamicString.optional(),
}).omit({ component: true });

export const StatCardApi: ComponentApi<typeof StatCardPropsSchema> = {
  name: "StatCard",
  schema: StatCardPropsSchema,
};

export const StatCard = createComponentImplementation(StatCardApi, ({ props }) => {
  const trendColor =
    props.trend === "up" ? "text-green-600" : props.trend === "down" ? "text-red-600" : "text-gray-600";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{props.label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-semibold ${trendColor}`}>{props.value}</p>
      </CardContent>
    </Card>
  );
});
