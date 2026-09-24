import { z } from "zod3";
import { CommonSchemas } from "@a2ui/web_core/v0_9";
import { StatCardApi, StatCardPropsSchema } from "@/components/catalog/StatCard.schema";
import { NavChartApi, NavChartPropsSchema } from "@/components/catalog/NavChart.schema";
import {
  ComparisonTableApi,
  ComparisonTablePropsSchema,
} from "@/components/catalog/ComparisonTable.schema";
import { RankedListApi, RankedListPropsSchema } from "@/components/catalog/RankedList.schema";
import {
  InsightCalloutApi,
  InsightCalloutPropsSchema,
} from "@/components/catalog/InsightCallout.schema";

// Pure message/schema definitions: no React, no @a2ui/react. This file is safe to import from
// server-only code (e.g. API route handlers) without pulling in the catalog components'
// React implementations, which transitively import @a2ui/react and would otherwise break
// Next.js route handler builds (Route Handlers resolve "react" under the server-only
// "react-server" export condition, which doesn't export createContext -- @a2ui/react calls
// createContext at module scope, so importing it anywhere in a route handler's module graph
// crashes Next.js's build-time page-data collection).

export const CATALOG_ID = "a2ui-mutual-fund-dashboard.local:v1";

const envelope = { id: z.string(), weight: z.number().optional() };

// The component schemas' own `points`/`rows`/`items`/`text` fields use the permissive
// DynamicValue/DynamicString union at the *rendering* layer (required so the A2UI
// generic binder actually resolves the {path} reference -- see NavChart.schema.ts).
// This LLM-output-facing schema re-narrows those same fields to strict DataBinding,
// so the app's "always path-bound, never a literal" promise is still validated here,
// where it matters: at the boundary between the LLM's generated structure and the
// rest of the app, before anything is cached or rendered.
export const AnyCatalogComponentSchema = z.discriminatedUnion("component", [
  z.object({ component: z.literal(StatCardApi.name), ...envelope, ...StatCardPropsSchema.shape }),
  z.object({
    component: z.literal(NavChartApi.name),
    ...envelope,
    ...NavChartPropsSchema.shape,
    points: CommonSchemas.DataBinding,
  }),
  z.object({
    component: z.literal(ComparisonTableApi.name),
    ...envelope,
    ...ComparisonTablePropsSchema.shape,
    rows: CommonSchemas.DataBinding,
  }),
  z.object({
    component: z.literal(RankedListApi.name),
    ...envelope,
    ...RankedListPropsSchema.shape,
    items: CommonSchemas.DataBinding,
  }),
  z.object({
    component: z.literal(InsightCalloutApi.name),
    ...envelope,
    ...InsightCalloutPropsSchema.shape,
    text: CommonSchemas.DataBinding,
  }),
]);

const CreateSurfaceMessageSchema = z.object({
  version: z.literal("v0.9"),
  createSurface: z.object({
    surfaceId: z.string(),
    catalogId: z.string(),
  }),
});

const UpdateComponentsMessageSchema = z.object({
  version: z.literal("v0.9"),
  updateComponents: z
    .object({
      surfaceId: z.string(),
      components: z.array(AnyCatalogComponentSchema).min(1),
    })
    .refine((val) => val.components.some((c) => c.id === "root"), {
      message: "updateComponents.components must include at least one component with id 'root'",
    }),
});

const UpdateDataModelMessageSchema = z.object({
  version: z.literal("v0.9"),
  updateDataModel: z.object({
    surfaceId: z.string(),
    path: z.string().optional(),
    value: z.unknown().optional(),
  }),
});

export const A2uiMessageSchema = z.union([
  CreateSurfaceMessageSchema,
  UpdateComponentsMessageSchema,
  UpdateDataModelMessageSchema,
]);

export type A2uiMessage = z.infer<typeof A2uiMessageSchema>;
export type CreateSurfaceMessage = z.infer<typeof CreateSurfaceMessageSchema>;
export type UpdateComponentsMessage = z.infer<typeof UpdateComponentsMessageSchema>;
export type UpdateDataModelMessage = z.infer<typeof UpdateDataModelMessageSchema>;
