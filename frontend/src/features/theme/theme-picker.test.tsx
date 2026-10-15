import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ThemePicker } from "./theme-picker";

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("ThemePicker", () => {
  it("starts on the saved theme", () => {
    localStorage.setItem("nudge-theme", "dark");
    render(<ThemePicker />);

    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
  });

  it("applies and remembers the chosen theme", async () => {
    render(<ThemePicker />);

    await userEvent.click(screen.getByRole("radio", { name: "Light" }));

    expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem("nudge-theme")).toBe("light");
  });
});
