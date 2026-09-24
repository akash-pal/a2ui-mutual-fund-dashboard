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
import { ComparisonTableApi, ComparisonTablePropsSchema } from "./ComparisonTable.schema";

export { ComparisonTableApi, ComparisonTablePropsSchema };

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
