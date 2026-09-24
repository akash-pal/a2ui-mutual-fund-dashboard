import { describe, it, expect } from "vitest";
import { MessageProcessor } from "@a2ui/web_core/v0_9";
import { appCatalog, CATALOG_ID, A2uiMessageSchema } from "./catalog";

describe("appCatalog", () => {
  it("registers exactly the five catalog components", () => {
    const names = Array.from(appCatalog.components.keys()).sort();
    expect(names).toEqual(
      ["ComparisonTable", "InsightCallout", "NavChart", "RankedList", "StatCard"].sort()
    );
  });
});

describe("A2uiMessageSchema", () => {
  it("validates a createSurface message", () => {
    const result = A2uiMessageSchema.safeParse({
      version: "v0.9",
      createSurface: { surfaceId: "stat", catalogId: CATALOG_ID },
    });
    expect(result.success).toBe(true);
  });

  it("validates an updateComponents message with a single StatCard root", () => {
    const result = A2uiMessageSchema.safeParse({
      version: "v0.9",
      updateComponents: {
        surfaceId: "stat",
        components: [
          { component: "StatCard", id: "root", label: "1-Year Return", value: { path: "/statValue" } },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an updateComponents message with no root component", () => {
    const result = A2uiMessageSchema.safeParse({
      version: "v0.9",
      updateComponents: {
        surfaceId: "stat",
        components: [
          { component: "StatCard", id: "not-root", label: "1-Year Return", value: { path: "/statValue" } },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown component name", () => {
    const result = A2uiMessageSchema.safeParse({
      version: "v0.9",
      updateComponents: {
        surfaceId: "stat",
        components: [{ component: "NotARealComponent", id: "root" }],
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("A2uiMessageSchema — additional protocol conformance", () => {
  it("rejects a component missing a required prop (StatCard without value)", () => {
    const result = A2uiMessageSchema.safeParse({
      version: "v0.9",
      updateComponents: {
        surfaceId: "stat",
        components: [{ component: "StatCard", id: "root", label: "1-Year Return" }],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-root component missing an id", () => {
    const result = A2uiMessageSchema.safeParse({
      version: "v0.9",
      updateComponents: {
        surfaceId: "stat",
        components: [
          { component: "StatCard", id: "root", label: "1-Year Return", value: { path: "/statValue" } },
          { component: "InsightCallout", text: { path: "/insightText" } },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts an updateDataModel message with a path and a scalar value", () => {
    const result = A2uiMessageSchema.safeParse({
      version: "v0.9",
      updateDataModel: { surfaceId: "stat", path: "/statValue", value: "+18.4%" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts an updateDataModel message with value omitted (deletes the key at path)", () => {
    const result = A2uiMessageSchema.safeParse({
      version: "v0.9",
      updateDataModel: { surfaceId: "stat", path: "/statValue" },
    });
    expect(result.success).toBe(true);
  });

  // The component prop schemas (NavChart/ComparisonTable/RankedList/InsightCallout)
  // must accept a literal value at the rendering layer -- the A2UI generic binder
  // only resolves a {path} reference when the field's schema is a union
  // (DynamicValue/DynamicString), never for a bare DataBinding object. So the
  // "always path-bound, never a literal" rule for LLM-generated structures has to
  // be enforced here instead, on AnyCatalogComponentSchema -- these tests guard
  // against that enforcement being silently lost (e.g. if a future edit forgets
  // the override and just spreads the permissive component schema through).
  it("rejects a literal points array for NavChart", () => {
    const result = A2uiMessageSchema.safeParse({
      version: "v0.9",
      updateComponents: {
        surfaceId: "chart",
        components: [
          {
            component: "NavChart",
            id: "root",
            title: "NAV Trend",
            points: [{ date: "01-01-2026", nav: 100 }],
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a literal rows array for ComparisonTable", () => {
    const result = A2uiMessageSchema.safeParse({
      version: "v0.9",
      updateComponents: {
        surfaceId: "table",
        components: [
          {
            component: "ComparisonTable",
            id: "root",
            title: "Fund Comparison",
            columns: ["Fund", "1Y Return"],
            rows: [["Fund A", "12%"]],
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a literal items array for RankedList", () => {
    const result = A2uiMessageSchema.safeParse({
      version: "v0.9",
      updateComponents: {
        surfaceId: "list",
        components: [
          {
            component: "RankedList",
            id: "root",
            title: "Top Large Cap Funds",
            items: [{ name: "Fund A", value: "12%" }],
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects literal text for InsightCallout", () => {
    const result = A2uiMessageSchema.safeParse({
      version: "v0.9",
      updateComponents: {
        surfaceId: "insight",
        components: [{ component: "InsightCallout", id: "root", text: "This fund did well." }],
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("MessageProcessor integration", () => {
  it("creates a surface from createSurface + updateComponents messages", () => {
    const processor = new MessageProcessor([appCatalog]);
    processor.processMessages([
      { version: "v0.9", createSurface: { surfaceId: "stat", catalogId: CATALOG_ID } },
      {
        version: "v0.9",
        updateComponents: {
          surfaceId: "stat",
          components: [
            { component: "StatCard", id: "root", label: "1-Year Return", value: { path: "/statValue" } },
          ],
        },
      },
      { version: "v0.9", updateDataModel: { surfaceId: "stat", value: { statValue: "+18.4%" } } },
    ]);
    expect(processor.model.surfacesMap.size).toBe(1);
    expect(processor.model.surfacesMap.has("stat")).toBe(true);
  });
});
