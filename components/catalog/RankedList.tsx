import { createComponentImplementation } from "@a2ui/react/v0_9";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RankedListApi, RankedListPropsSchema } from "./RankedList.schema";

export { RankedListApi, RankedListPropsSchema };

export const RankedList = createComponentImplementation(RankedListApi, ({ props }) => {
  const items = Array.isArray(props.items) ? (props.items as Array<{ name: string; value: string }>) : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{props.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {items.map((item, i) => (
            <li key={item.name} className="flex justify-between border-b pb-1">
              <span>
                {i + 1}. {item.name}
              </span>
              <span className="font-medium">{item.value}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
});
