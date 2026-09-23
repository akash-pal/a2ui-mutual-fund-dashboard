import { z } from "zod3";
import { CommonSchemas, type ComponentApi } from "@a2ui/web_core/v0_9";
import { createComponentImplementation } from "@a2ui/react/v0_9";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const ComparisonTablePropsSchema = z.object({
  title: CommonSchemas.DynamicString,
  columns: z.array(z.string()).min(1),
  rows: CommonSchemas.DataBinding, // always {path}: real values are never literals
});

export const ComparisonTableApi: ComponentApi<typeof ComparisonTablePropsSchema> = {
  name: "ComparisonTable",
  schema: ComparisonTablePropsSchema,
};

export const ComparisonTable = createComponentImplementation(ComparisonTableApi, ({ props }) => {
  const rows = Array.isArray(props.rows) ? (props.rows as Array<Array<string | number>>) : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{props.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {(props.columns as string[]).map((col) => (
                <TableHead key={col}>{col}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                {row.map((cell, j) => (
                  <TableCell key={j}>{cell}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
});
