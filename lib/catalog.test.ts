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
            columns: { path: "/columns" },
            rows: [["Fund A", "12%"]],
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a literal columns array for ComparisonTable", () => {
    // columns is server-supplied alongside rows (not LLM-authored) precisely so
    // the header count can never drift from the real row width -- this guards
    // against that enforcement being silently lost.
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
            rows: { path: "/rows" },
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

  // The rendering-layer DynamicString/DynamicValue unions also accept a FunctionCall
  // ({call, args, returnType} -- see node_modules/@a2ui/web_core/src/v0_9/schema/
  // common-types.js) alongside a literal and a DataBinding. Nothing this app prompts
  // for ever needs one (every field is asked for as a literal or a specific path,
  // never "call a function"), so the LLM-facing schema narrows every field to
  // exactly one of those two shapes -- these tests guard against a FunctionCall
  // slipping through either kind of field.
  it("rejects a FunctionCall value for a literal-only field (NavChart's title)", () => {
    const result = A2uiMessageSchema.safeParse({
      version: "v0.9",
      updateComponents: {
        surfaceId: "chart",
        components: [
          {
            component: "NavChart",
            id: "root",
            title: { call: "getTitle", args: {}, returnType: "string" },
            points: { path: "/navPoints" },
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a FunctionCall value for a path-bound-only field (StatCard's value)", () => {
    const result = A2uiMessageSchema.safeParse({
      version: "v0.9",
      updateComponents: {
        surfaceId: "stat",
        components: [
          {
            component: "StatCard",
            id: "root",
            label: "1-Year Return",
            value: { call: "getValue", args: {}, returnType: "string" },
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a path-bound title for NavChart (every prompt asks for title as a literal string)", () => {
    const result = A2uiMessageSchema.safeParse({
      version: "v0.9",
      updateComponents: {
        surfaceId: "chart",
        components: [
          {
            component: "NavChart",
            id: "root",
            title: { path: "/chartTitle" },
            points: { path: "/navPoints" },
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a literal (non-path) value for StatCard's value field", () => {
    const result = A2uiMessageSchema.safeParse({
      version: "v0.9",
      updateComponents: {
        surfaceId: "stat",
        components: [{ component: "StatCard", id: "root", label: "1-Year Return", value: "+18.4%" }],
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
