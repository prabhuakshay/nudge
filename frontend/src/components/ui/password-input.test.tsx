import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PasswordInput } from "./password-input";

function renderInput() {
  render(
    <>
      <label htmlFor="password">Password</label>
      <PasswordInput id="password" />
    </>,
  );
  return userEvent.setup();
}

describe("PasswordInput", () => {
  it("hides the password until asked to show it", async () => {
    const user = renderInput();
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("warns while Caps Lock is on", async () => {
    const user = renderInput();
    await user.click(screen.getByLabelText("Password"));

    await user.keyboard("{CapsLock}A");
    expect(screen.getByLabelText("Password")).toHaveAccessibleDescription("Caps Lock is on.");

    await user.keyboard("{CapsLock}a");
    expect(screen.queryByText("Caps Lock is on.")).not.toBeInTheDocument();
  });
});
