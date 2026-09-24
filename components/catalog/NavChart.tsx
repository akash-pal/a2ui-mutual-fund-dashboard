import { createComponentImplementation } from "@a2ui/react/v0_9";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NavChartApi, NavChartPropsSchema } from "./NavChart.schema";

export { NavChartApi, NavChartPropsSchema };

export const NavChart = createComponentImplementation(NavChartApi, ({ props }) => {
  const points = Array.isArray(props.points) ? (props.points as Array<{ date: string; nav: number }>) : [];
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
