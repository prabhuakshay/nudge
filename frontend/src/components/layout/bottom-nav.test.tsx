import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { INBOX, json } from "@/test/drawer";
import { EXPANDED_USER, signedInClient } from "@/test/session";

import { BottomNav } from "./bottom-nav";
import { MobileMenu } from "./mobile-menu";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

const hrefs = (nav: HTMLElement) =>
  within(nav)
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"));

describe("Phone navigation", () => {
  it("puts Calendar in the bottom bar where Upcoming was", () => {
    render(<BottomNav />);

    expect(hrefs(screen.getByRole("navigation", { name: "Views" }))).toEqual([
      "/inbox",
      "/",
      "/calendar",
    ]);
  });

  it("keeps Upcoming, Calendar and the Matrix in the phone menu", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        json({
          inbox: INBOX,
          items: [],
          archived: [],
          tags: [],
          people: [],
          today_count: 0,
          upcoming_count: 0,
          all_count: 0,
        }),
      ),
    );
    render(
      <QueryClientProvider client={signedInClient(EXPANDED_USER)}>
        <MobileMenu />
      </QueryClientProvider>,
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "Open menu" }));

    const views = within(await screen.findByRole("dialog", { name: "Menu" })).getByRole(
      "navigation",
      { name: "Views" },
    );
    expect(hrefs(views)).toEqual(["/inbox", "/", "/upcoming", "/calendar", "/matrix", "/all"]);
  });
});
