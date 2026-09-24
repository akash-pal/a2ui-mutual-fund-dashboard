import { Catalog, type ComponentApi } from "@a2ui/web_core/v0_9";
import { StatCard } from "@/components/catalog/StatCard";
import { NavChart } from "@/components/catalog/NavChart";
import { ComparisonTable } from "@/components/catalog/ComparisonTable";
import { RankedList } from "@/components/catalog/RankedList";
import { InsightCallout } from "@/components/catalog/InsightCallout";
import { CATALOG_ID } from "./catalog-messages";

// This file imports the actual React catalog components (via ./catalog-messages's sibling
// component files), so it is client/render-side only -- server-only code (e.g. app/api route
// handlers) must import from "./catalog-messages" directly instead of this file. See the
// comment at the top of catalog-messages.ts for why.
export * from "./catalog-messages";

export const appCatalog = new Catalog(
  CATALOG_ID,
  [StatCard, NavChart, ComparisonTable, RankedList, InsightCallout] as unknown as ComponentApi[],
  []
);
