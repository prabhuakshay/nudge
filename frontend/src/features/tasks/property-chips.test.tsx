import { screen, waitFor, within } from "@testing-library/react";

import { bulkRequests, mockApi, openTask, patches, renderList, task } from "@/test/drawer";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PropertyChips", () => {
  it("sets the Status from its chip, with an Undo toast that puts it back", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: "Buy milk" })]);
    const user = renderList();
    const drawer = await openTask(user, "Buy milk");

    await user.click(within(drawer).getByRole("button", { name: "Status: Open" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Won't do" }));

    expect(await within(drawer).findByRole("button", { name: "Status: Won't do" })).toBeVisible();
    expect(await screen.findByText("Marked Won't do “Buy milk”")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(await within(drawer).findByRole("button", { name: "Status: Open" })).toBeVisible();
    expect(await patches(fetchSpy)).toEqual([["/api/v1/tasks/1", { status: "wont_do" }]]);
    expect(await bulkRequests(fetchSpy)).toEqual([
      {
        ids: [1],
        action: { kind: "statuses", statuses: [{ id: 1, status: "open", blocked_reason: "" }] },
      },
    ]);
  });

  it("keeps a Blocked reason in its card and restores it with Undo", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: "Ship it" })]);
    const user = renderList();
    const drawer = await openTask(user, "Ship it");

    await user.click(within(drawer).getByRole("button", { name: "Status: Open" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Blocked" }));
    const reason = await within(drawer).findByRole("textbox", { name: "Blocked reason" });
    await user.type(reason, "Waiting on Ada");
    await user.tab();
    await user.click(within(drawer).getByRole("checkbox", { name: "Complete “Ship it”" }));
    const toast = (await screen.findByText("Completed “Ship it”")).closest<HTMLElement>("li");
    if (!toast) throw new Error("No toast for the change.");
    await user.click(within(toast).getByRole("button", { name: "Undo" }));

    expect(await within(drawer).findByRole("textbox", { name: "Blocked reason" })).toHaveValue(
      "Waiting on Ada",
    );
    expect(await patches(fetchSpy)).toEqual([
      ["/api/v1/tasks/1", { status: "blocked" }],
      ["/api/v1/tasks/1", { blocked_reason: "Waiting on Ada" }],
      ["/api/v1/tasks/1", { status: "completed" }],
    ]);
    expect(await bulkRequests(fetchSpy)).toEqual([
      {
        ids: [1],
        action: {
          kind: "statuses",
          statuses: [{ id: 1, status: "blocked", blocked_reason: "Waiting on Ada" }],
        },
      },
    ]);
  });

  it("sets the Priority from its chip", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: "Buy milk" })]);
    const user = renderList();
    const drawer = await openTask(user, "Buy milk");

    await user.click(within(drawer).getByRole("button", { name: "Priority: No priority" }));
    // Each Priority shows what to type for it in Quick add.
    expect(screen.getByRole("menuitemradio", { name: "Priority 1" })).toHaveTextContent("!1");
    await user.click(screen.getByRole("menuitemradio", { name: /Priority 1/ }));

    const chip = await within(drawer).findByRole("button", { name: "Priority: Priority 1" });
    expect(chip).toBeVisible();
    expect(await bulkRequests(fetchSpy)).toEqual([
      { ids: [1], action: { kind: "priority", priority: 1 } },
    ]);
  });

  it("moves the Task to the Project picked from its Project chip", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: "Buy milk" })]);
    const user = renderList();
    const drawer = await openTask(user, "Buy milk");

    await user.click(
      within(drawer).getByRole("button", { name: "Project: Inbox. Move to another project" }),
    );
    await user.click(await screen.findByRole("option", { name: "Work" }));

    await waitFor(async () => {
      expect(await bulkRequests(fetchSpy)).toEqual([
        { ids: [1], action: { kind: "move", project_id: 8 } },
      ]);
    });
    expect(
      await within(drawer).findByRole("button", { name: "Project: Work. Move to another project" }),
    ).toBeInTheDocument();
  });
});

describe("PropertyChips on phones", () => {
  it("moves the Task to a Project picked from a bottom sheet", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: "Buy milk" })]);
    const user = renderList({ wide: false });
    const drawer = await openTask(user, "Buy milk");

    await user.click(
      within(drawer).getByRole("button", { name: "Project: Inbox. Move to another project" }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Move to project" });
    await user.click(within(sheet).getByRole("option", { name: "Work" }));

    expect(sheet).toHaveAttribute("data-vaul-drawer");
    await waitFor(async () => {
      expect(await bulkRequests(fetchSpy)).toEqual([
        { ids: [1], action: { kind: "move", project_id: 8 } },
      ]);
    });
  });
});
