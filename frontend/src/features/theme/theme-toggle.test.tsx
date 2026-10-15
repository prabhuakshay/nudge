import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ThemeToggle } from "./theme-toggle";

function mockSystemScheme(scheme: "light" | "dark") {
  vi.stubGlobal("matchMedia", () => ({ matches: scheme === "dark" }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("ThemeToggle", () => {
  it("starts on the system scheme", () => {
    mockSystemScheme("dark");
    render(<ThemeToggle />);
    expect(screen.getByRole("switch", { name: "Dark mode" })).toBeChecked();
  });

  it("starts on the saved theme over the system one", () => {
    mockSystemScheme("dark");
    localStorage.setItem("nudge-theme", "light");
    render(<ThemeToggle />);
    expect(screen.getByRole("switch", { name: "Dark mode" })).not.toBeChecked();
  });

  it("switches away from the system scheme and remembers it", async () => {
    mockSystemScheme("light");
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole("switch", { name: "Dark mode" }));

    expect(screen.getByRole("switch", { name: "Dark mode" })).toBeChecked();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("nudge-theme")).toBe("dark");
  });

  it("follows the system again when switched back to it", async () => {
    mockSystemScheme("light");
    localStorage.setItem("nudge-theme", "dark");
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole("switch", { name: "Dark mode" }));

    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
    expect(localStorage.getItem("nudge-theme")).toBeNull();
  });
});
