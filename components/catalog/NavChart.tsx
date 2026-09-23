import { z } from "zod3";
import { CommonSchemas, type ComponentApi } from "@a2ui/web_core/v0_9";
import { createComponentImplementation } from "@a2ui/react/v0_9";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const NavChartPropsSchema = z.object({
  title: CommonSchemas.DynamicString,
  points: CommonSchemas.DataBinding, // always {path}: real numbers are never literals
});

export const NavChartApi: ComponentApi<typeof NavChartPropsSchema> = {
  name: "NavChart",
  schema: NavChartPropsSchema,
};

export const NavChart = createComponentImplementation(NavChartApi, ({ props }) => {
  const points = (props.points as Array<{ date: string; nav: number }>) ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{props.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={points}>
            <XAxis dataKey="date" hide />
            <YAxis domain={["auto", "auto"]} width={50} />
            <Tooltip />
            <Line type="monotone" dataKey="nav" stroke="#2563eb" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
});
