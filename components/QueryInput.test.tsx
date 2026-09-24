import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryInput } from "./QueryInput";

describe("QueryInput", () => {
  it("calls onSubmit with the typed query when the form is submitted", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<QueryInput onSubmit={onSubmit} />);

    await user.type(screen.getByRole("textbox"), "How has Example Fund done?");
    await user.click(screen.getByRole("button", { name: /ask/i }));

    expect(onSubmit).toHaveBeenCalledWith("How has Example Fund done?");
  });

  it("does not call onSubmit for an empty query", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<QueryInput onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: /ask/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables the button while disabled is true", () => {
    render(<QueryInput onSubmit={vi.fn()} disabled />);
    expect(screen.getByRole("button", { name: /ask/i })).toBeDisabled();
  });
});
