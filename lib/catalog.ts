import { z } from "zod3";
import { Catalog, type ComponentApi } from "@a2ui/web_core/v0_9";
import { StatCardApi, StatCard, StatCardPropsSchema } from "@/components/catalog/StatCard";
import { NavChartApi, NavChart, NavChartPropsSchema } from "@/components/catalog/NavChart";
import {
  ComparisonTableApi,
  ComparisonTable,
  ComparisonTablePropsSchema,
} from "@/components/catalog/ComparisonTable";
import { RankedListApi, RankedList, RankedListPropsSchema } from "@/components/catalog/RankedList";
import {
  InsightCalloutApi,
  InsightCallout,
  InsightCalloutPropsSchema,
} from "@/components/catalog/InsightCallout";

export const CATALOG_ID = "a2ui-mutual-fund-dashboard.local:v1";

export const appCatalog = new Catalog(
  CATALOG_ID,
  [StatCard, NavChart, ComparisonTable, RankedList, InsightCallout] as unknown as ComponentApi[],
  []
);

const envelope = { id: z.string(), weight: z.number().optional() };

const AnyCatalogComponentSchema = z.discriminatedUnion("component", [
  z.object({ component: z.literal(StatCardApi.name), ...envelope, ...StatCardPropsSchema.shape }),
  z.object({ component: z.literal(NavChartApi.name), ...envelope, ...NavChartPropsSchema.shape }),
  z.object({
    component: z.literal(ComparisonTableApi.name),
    ...envelope,
    ...ComparisonTablePropsSchema.shape,
  }),
  z.object({ component: z.literal(RankedListApi.name), ...envelope, ...RankedListPropsSchema.shape }),
  z.object({
    component: z.literal(InsightCalloutApi.name),
    ...envelope,
    ...InsightCalloutPropsSchema.shape,
  }),
]);

export { AnyCatalogComponentSchema };

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
