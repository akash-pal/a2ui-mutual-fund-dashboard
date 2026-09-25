import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { A2UISurfaceList } from "./A2UISurface";
import { CATALOG_ID, type A2uiMessage } from "@/lib/catalog";

// Recharts' ResponsiveContainer needs real layout dimensions to render its
// children -- under jsdom it always measures 0 width and renders NOTHING
// (not even a stubbed child), regardless of whether the chart's data is
// correct. Stubbing both ResponsiveContainer (to bypass the dimension gate)
// and LineChart (to capture its `data` prop) lets the NavChart test assert
// on the actual data that reached it, sidestepping that limitation instead
// of testing around it.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => <>{children}</>,
    LineChart: ({ data }: { data: unknown }) => (
      <div data-testid="line-chart-data">{JSON.stringify(data)}</div>
    ),
  };
});

describe("A2UISurfaceList", () => {
  it("renders a StatCard surface driven by createSurface/updateComponents/updateDataModel messages", () => {
    const messages: A2uiMessage[] = [
      { version: "v0.9", createSurface: { surfaceId: "stat", catalogId: CATALOG_ID } },
      {
        version: "v0.9",
        updateComponents: {
          surfaceId: "stat",
          components: [
            { component: "StatCard", id: "root", label: "1-Year Return", value: { path: "/statValue" }, trend: { path: "/statTrend" } },
          ],
        },
      },
      { version: "v0.9", updateDataModel: { surfaceId: "stat", value: { statValue: "+18.4%" } } },
    ];

    render(<A2UISurfaceList messages={messages} />);

    expect(screen.getByText("1-Year Return")).toBeInTheDocument();
    expect(screen.getByText("+18.4%")).toBeInTheDocument();
  });

  it("renders nothing when there are no messages", () => {
    const { container } = render(<A2UISurfaceList messages={[]} />);
    expect(container.textContent).toBe("");
  });

  it("processes a second, unrelated message set without throwing (each query replaces the previous processor)", () => {
    const firstMessages: A2uiMessage[] = [
      { version: "v0.9", createSurface: { surfaceId: "stat", catalogId: CATALOG_ID } },
      {
        version: "v0.9",
        updateComponents: {
          surfaceId: "stat",
          components: [
            { component: "StatCard", id: "root", label: "1-Year Return", value: { path: "/statValue" }, trend: { path: "/statTrend" } },
          ],
        },
      },
      { version: "v0.9", updateDataModel: { surfaceId: "stat", value: { statValue: "+18.4%" } } },
    ];
    const secondMessages: A2uiMessage[] = [
      { version: "v0.9", createSurface: { surfaceId: "stat", catalogId: CATALOG_ID } },
      {
        version: "v0.9",
        updateComponents: {
          surfaceId: "stat",
          components: [
            { component: "StatCard", id: "root", label: "3-Year Return", value: { path: "/statValue" }, trend: { path: "/statTrend" } },
          ],
        },
      },
      { version: "v0.9", updateDataModel: { surfaceId: "stat", value: { statValue: "+42.0%" } } },
    ];

    const { rerender } = render(<A2UISurfaceList messages={firstMessages} />);
    expect(screen.getByText("1-Year Return")).toBeInTheDocument();

    expect(() => rerender(<A2UISurfaceList messages={secondMessages} />)).not.toThrow();
    expect(screen.getByText("3-Year Return")).toBeInTheDocument();
    expect(screen.getByText("+42.0%")).toBeInTheDocument();
  });

  // These four tests render each of the remaining catalog components through the
  // REAL MessageProcessor + A2uiSurface pipeline (not a mocked schema.safeParse
  // check) with a genuinely path-bound array/text prop. This is the exact class of
  // test that would have caught a real bug: a bare CommonSchemas.DataBinding prop
  // is never resolved by the A2UI generic binder (it's classified as a static
  // nested object, not a dynamic reference), so the component received the
  // literal {path: "..."} instead of the bound value -- InsightCallout crashed
  // outright, and NavChart/ComparisonTable/RankedList silently rendered empty.
  // No test before this one exercised real rendering for these four components.

  it("renders InsightCallout's actual bound text, not the unresolved {path} object", () => {
    const messages: A2uiMessage[] = [
      { version: "v0.9", createSurface: { surfaceId: "insight", catalogId: CATALOG_ID } },
      {
        version: "v0.9",
        updateComponents: {
          surfaceId: "insight",
          components: [{ component: "InsightCallout", id: "root", text: { path: "/insightText" } }],
        },
      },
      {
        version: "v0.9",
        updateDataModel: { surfaceId: "insight", value: { insightText: "The fund grew steadily." } },
      },
    ];

    expect(() => render(<A2UISurfaceList messages={messages} />)).not.toThrow();
    expect(screen.getByText("The fund grew steadily.")).toBeInTheDocument();
  });

  it("renders ComparisonTable's actual bound rows, not an empty table", () => {
    const messages: A2uiMessage[] = [
      { version: "v0.9", createSurface: { surfaceId: "table", catalogId: CATALOG_ID } },
      {
        version: "v0.9",
        updateComponents: {
          surfaceId: "table",
          components: [
            {
              component: "ComparisonTable",
              id: "root",
              title: "Fund Comparison",
              columns: { path: "/columns" },
              rows: { path: "/rows" },
            },
          ],
        },
      },
      {
        version: "v0.9",
        updateDataModel: {
          surfaceId: "table",
          value: {
            columns: ["Fund", "1Y Return"],
            rows: [["Example Fund A", "12.3%"], ["Example Fund B", "9.8%"]],
          },
        },
      },
    ];

    expect(() => render(<A2UISurfaceList messages={messages} />)).not.toThrow();
    expect(screen.getByText("Example Fund A")).toBeInTheDocument();
    expect(screen.getByText("12.3%")).toBeInTheDocument();
  });

  it("renders RankedList's actual bound items, not an empty list", () => {
    const messages: A2uiMessage[] = [
      { version: "v0.9", createSurface: { surfaceId: "list", catalogId: CATALOG_ID } },
      {
        version: "v0.9",
        updateComponents: {
          surfaceId: "list",
          components: [
            { component: "RankedList", id: "root", title: "Top Large Cap Funds", items: { path: "/items" } },
          ],
        },
      },
      {
        version: "v0.9",
        updateDataModel: {
          surfaceId: "list",
          value: { items: [{ name: "Example Fund A", value: "18.4%" }] },
        },
      },
    ];

    expect(() => render(<A2UISurfaceList messages={messages} />)).not.toThrow();
    // RankedList renders "{i + 1}. {item.name}" as sibling text nodes in one <span>,
    // so the fund name isn't its own exact-text node -- match on the element's
    // combined text content instead of an exact string.
    expect(screen.getByText((_, element) => element?.textContent === "1. Example Fund A")).toBeInTheDocument();
    expect(screen.getByText("18.4%")).toBeInTheDocument();
  });

  it("resolves NavChart's bound points to the real array, not the unresolved {path} object", () => {
    const messages: A2uiMessage[] = [
      { version: "v0.9", createSurface: { surfaceId: "chart", catalogId: CATALOG_ID } },
      {
        version: "v0.9",
        updateComponents: {
          surfaceId: "chart",
          components: [
            { component: "NavChart", id: "root", title: "NAV Trend", points: { path: "/navPoints" } },
          ],
        },
      },
      {
        version: "v0.9",
        updateDataModel: {
          surfaceId: "chart",
          value: { navPoints: [{ date: "01-01-2026", nav: 100 }, { date: "02-01-2026", nav: 105 }] },
        },
      },
    ];

    expect(() => render(<A2UISurfaceList messages={messages} />)).not.toThrow();
    expect(screen.getByText("NAV Trend")).toBeInTheDocument();
    // If `points` had resolved to the unresolved {path: "..."} object instead of
    // the real array, Array.isArray(props.points) would be false and NavChart
    // would pass an empty array to LineChart -- assert the real points reached
    // it instead.
    const chartData = JSON.parse(screen.getByTestId("line-chart-data").textContent ?? "[]");
    expect(chartData).toEqual([
      { date: "01-01-2026", nav: 100 },
      { date: "02-01-2026", nav: 105 },
    ]);
  });

  it("renders correctly under React.StrictMode (which double-invokes effects on mount in dev)", () => {
    // None of the tests above catch this: @testing-library/react's render() does not
    // wrap in StrictMode by default, so they never exercise dev mode's mount ->
    // simulated-unmount -> mount-again effect cycle. In the real app, every query's
    // <ErrorBoundary key={queryCount}> gives this component a fresh `key`, forcing a
    // real remount on every single query (not just once per page load) -- so this
    // double-invoke happens on every query in dev, not just the first render ever.
    const messages: A2uiMessage[] = [
      { version: "v0.9", createSurface: { surfaceId: "stat", catalogId: CATALOG_ID } },
      {
        version: "v0.9",
        updateComponents: {
          surfaceId: "stat",
          components: [
            {
              component: "StatCard",
              id: "root",
              label: "1-Year Return",
              value: { path: "/statValue" },
              trend: { path: "/statTrend" },
            },
          ],
        },
      },
      { version: "v0.9", updateDataModel: { surfaceId: "stat", value: { statValue: "+18.4%" } } },
    ];

    expect(() =>
      render(
        <StrictMode>
          <A2UISurfaceList messages={messages} />
        </StrictMode>
      )
    ).not.toThrow();
    expect(screen.getByText("1-Year Return")).toBeInTheDocument();
    expect(screen.getByText("+18.4%")).toBeInTheDocument();
  });
});
