import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { json, WORK } from "@/test/drawer";

import { ArchivedProjectRow, ProjectRow } from "./sidebar-rows";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/projects">{children}</a>,
}));

function renderRow(row: ReactNode) {
  vi.spyOn(globalThis, "fetch").mockImplementation(() => json([]));
  render(<QueryClientProvider client={new QueryClient()}>{row}</QueryClientProvider>);
  return userEvent.setup();
}

describe("Sharing from a Project's menu", () => {
  it.each([
    [
      "a Project",
      <ProjectRow
        key="live"
        project={WORK}
        items={[]}
        folders={[]}
        onEdit={() => undefined}
        onMove={() => undefined}
      />,
    ],
    [
      "an archived Project",
      <ArchivedProjectRow key="archived" project={{ ...WORK, is_archived: true }} />,
    ],
  ])("opens the Share panel of %s", async (_kind, row) => {
    const user = renderRow(row);

    await user.click(screen.getByRole("button", { name: "Work options" }));
    await user.click(screen.getByRole("menuitem", { name: "Share" }));

    const panel = await screen.findByRole("dialog", { name: "Share “Work”" });
    expect(await within(panel).findByText(/not shared/i)).toBeInTheDocument();
  });
});
