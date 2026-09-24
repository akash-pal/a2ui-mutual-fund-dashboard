import { createComponentImplementation } from "@a2ui/react/v0_9";
import { InsightCalloutApi, InsightCalloutPropsSchema } from "./InsightCallout.schema";

export { InsightCalloutApi, InsightCalloutPropsSchema };

export const InsightCallout = createComponentImplementation(InsightCalloutApi, ({ props }) => {
  return (
    <div className="rounded-md border-l-4 border-blue-500 bg-blue-50 p-3 text-sm text-blue-900">
      {props.text as string}
    </div>
  );
});
