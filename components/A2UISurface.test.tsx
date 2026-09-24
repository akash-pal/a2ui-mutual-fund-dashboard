import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { A2UISurfaceList } from "./A2UISurface";
import { CATALOG_ID, type A2uiMessage } from "@/lib/catalog";

describe("A2UISurfaceList", () => {
  it("renders a StatCard surface driven by createSurface/updateComponents/updateDataModel messages", () => {
    const messages: A2uiMessage[] = [
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
            { component: "StatCard", id: "root", label: "1-Year Return", value: { path: "/statValue" } },
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
            { component: "StatCard", id: "root", label: "3-Year Return", value: { path: "/statValue" } },
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
});
