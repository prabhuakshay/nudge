import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Toaster } from "@/components/ui/sonner";
import { sessionQuery } from "@/features/auth/session";
import { toastWithUndo } from "@/lib/undo-toast";

import { GlobalShortcuts } from "./global-shortcuts";
import { SHORTCUTS } from "./registry";

vi.mock("@/features/settings/settings-dialog", () => ({
  SettingsDialog: ({ open }: { open: boolean }) => (open ? <p>Settings are open</p> : null),
}));

const ada = {
  id: 1,
  email: "ada@example.com",
  full_name: "Ada Lovelace",
  time_zone: "Europe/London",
  single_key_shortcuts: true,
};

function renderApp() {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <GlobalShortcuts user={ada} />
        <Outlet />
        <Toaster />
      </>
    ),
  });
  const page = (path: string, title: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => <h1>{title}</h1> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      page("/", "Today"),
      page("/inbox", "Inbox"),
      page("/upcoming", "Upcoming"),
      page("/search", "Search"),
      page("/trash", "Trash"),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const queryClient = new QueryClient();
  queryClient.setQueryData(sessionQuery.queryKey, ada);
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe("GlobalShortcuts", () => {
  it.each([
    ["gi", "Inbox"],
    ["gu", "Upcoming"],
    ["gs", "Search"],
    ["gx", "Trash"],
  ])("goes to a view with a G chord (%s)", async (keys, title) => {
    const user = renderApp();
    await screen.findByRole("heading", { name: "Today" });

    await user.keyboard(keys);

    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
  });

  it("opens Settings with G then comma", async () => {
    const user = renderApp();
    await screen.findByRole("heading", { name: "Today" });

    await user.keyboard("g,");

    expect(screen.getByText("Settings are open")).toBeInTheDocument();
  });

  it("lists every registered shortcut when ? is pressed", async () => {
    const user = renderApp();
    await screen.findByRole("heading", { name: "Today" });

    await user.keyboard("{Shift>}?{/Shift}");

    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    const sections = { global: "Anywhere", list: "Task list", detail: "Task drawer" };
    for (const { label, scope } of Object.values(SHORTCUTS)) {
      const section = within(dialog).getByRole("region", { name: sections[scope] });
      expect(within(section).getByText(label)).toBeInTheDocument();
    }
  });

  it("undoes the latest change still offering Undo with Mod+Z", async () => {
    const user = renderApp();
    await screen.findByRole("heading", { name: "Today" });
    const first = vi.fn();
    const second = vi.fn();
    toastWithUndo("Completed “Tea”", first);
    toastWithUndo("Completed “Cake”", second);

    await user.keyboard("{Control>}z{/Control}");
    await user.keyboard("{Control>}z{/Control}");

    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });
});
