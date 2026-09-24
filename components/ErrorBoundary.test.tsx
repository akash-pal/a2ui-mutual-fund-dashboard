import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

function Bomb(): never {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary fallback={() => <p>fallback</p>}>
        <p>ok</p>
      </ErrorBoundary>
    );
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("renders the fallback instead of crashing the page when a child throws", () => {
    // React logs the caught error to the console; suppress that expected noise.
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={(error) => <p>Something broke: {error.message}</p>}>
        <Bomb />
      </ErrorBoundary>
    );
    expect(screen.getByText("Something broke: boom")).toBeInTheDocument();
    consoleSpy.mockRestore();
  });
});
