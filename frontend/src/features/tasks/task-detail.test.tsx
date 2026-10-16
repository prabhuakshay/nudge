import { screen, within } from "@testing-library/react";

import { minutesAgo, mockApi, openTask, patches, renderList, task } from "@/test/drawer";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TaskDetail", () => {
  it("opens a Task from a click anywhere on its row, under its Project", async () => {
    mockApi([task({ id: 1, title: "Buy milk", description: "Two **litres**" })]);
    const user = renderList();

    const drawer = await openTask(user, "Buy milk");

    expect(within(drawer).getByRole("textbox", { name: "Title" })).toHaveValue("Buy milk");
    expect(
      within(drawer).getByRole("button", { name: "Project: Inbox. Move to another project" }),
    ).toBeInTheDocument();
    expect(await within(drawer).findByText("litres")).toContainHTML("<strong>litres</strong>");
  });

  it("leaves the drawer closed when the row's checkbox is clicked", async () => {
    mockApi([task({ id: 1, title: "Buy milk" })]);
    const user = renderList();

    await user.click(await screen.findByRole("checkbox", { name: "Complete “Buy milk”" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the focused row with Enter", async () => {
    mockApi([task({ id: 1, title: "Buy milk" })]);
    const user = renderList();
    await screen.findByText("Buy milk");

    await user.tab();
    await user.tab();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("dialog", { name: "Task details" })).toBeInTheDocument();
  });

  it("renames the Task on Enter", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: "Buy milk" })]);
    const user = renderList();
    const drawer = await openTask(user, "Buy milk");
    const title = await within(drawer).findByRole("textbox", { name: "Title" });

    await user.clear(title);
    await user.type(title, "  Buy oat milk {Enter}");

    expect(await patches(fetchSpy)).toEqual([["/api/v1/tasks/1", { title: "Buy oat milk" }]]);
    expect(title).not.toHaveFocus();
  });

  it("never reads Quick add tokens in an edited title", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: "Buy milk" })]);
    const user = renderList();
    const drawer = await openTask(user, "Buy milk");
    const title = await within(drawer).findByRole("textbox", { name: "Title" });

    await user.clear(title);
    await user.type(title, "Buy milk #dairy !1 ~Work{Enter}");

    expect(await patches(fetchSpy)).toEqual([
      ["/api/v1/tasks/1", { title: "Buy milk #dairy !1 ~Work" }],
    ]);
  });

  it("puts a cleared title back instead of saving it", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: "Buy milk" })]);
    const user = renderList();
    const drawer = await openTask(user, "Buy milk");
    const title = await within(drawer).findByRole("textbox", { name: "Title" });

    await user.clear(title);
    await user.tab();

    expect(title).toHaveValue("Buy milk");
    expect(await patches(fetchSpy)).toEqual([]);
  });

  it("edits the Description as markdown text and saves it on blur", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: "Buy milk", description: "Two **litres**" })]);
    const user = renderList();
    const drawer = await openTask(user, "Buy milk");

    await user.click(await within(drawer).findByRole("button", { name: "Edit description" }));
    const description = within(drawer).getByRole("textbox", { name: "Description" });
    expect(description).toHaveFocus();
    expect(description).toHaveValue("Two **litres**");
    await user.type(description, ", semi-skimmed");
    await user.tab();

    expect(await patches(fetchSpy)).toEqual([
      ["/api/v1/tasks/1", { description: "Two **litres**, semi-skimmed" }],
    ]);
    expect(await within(drawer).findByText(/semi-skimmed/)).toBeInTheDocument();
  });

  it("renders a Description's raw HTML and script links as inert text", async () => {
    mockApi([
      task({
        id: 1,
        title: "Buy milk",
        description: '<img src=x onerror="alert(1)"> [click](javascript:alert(1))',
      }),
    ]);
    const user = renderList();
    const drawer = await openTask(user, "Buy milk");

    const link = (await within(drawer).findByText("click")).closest("a");

    expect(link?.getAttribute("href")).not.toContain("javascript");
    expect(drawer.querySelector("img")).toBeNull();
  });

  it("steps through the list with J/K and the arrow keys", async () => {
    mockApi([
      task({ id: 1, title: "Buy milk" }),
      task({ id: 2, title: "Call mum" }),
      task({ id: 3, title: "Pay rent" }),
    ]);
    const user = renderList();
    await openTask(user, "Buy milk");
    const title = () => screen.findByRole("textbox", { name: "Title" });

    await user.keyboard("j");
    expect(await title()).toHaveValue("Call mum");
    await user.keyboard("{ArrowDown}");
    expect(await title()).toHaveValue("Pay rent");
    expect(screen.getByRole("button", { name: "Next task" })).toBeDisabled();
    await user.keyboard("k");
    expect(await title()).toHaveValue("Call mum");
    await user.keyboard("{ArrowUp}");
    expect(await title()).toHaveValue("Buy milk");
    expect(screen.getByRole("button", { name: "Previous task" })).toBeDisabled();
  });

  it("closes on Esc and hands focus to the row of the Task it showed", async () => {
    mockApi([task({ id: 1, title: "Buy milk" }), task({ id: 2, title: "Call mum" })]);
    const user = renderList();
    await openTask(user, "Buy milk");
    await user.click(await screen.findByRole("button", { name: "Next task" }));
    expect(await screen.findByRole("textbox", { name: "Title" })).toHaveValue("Call mum");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Call mum").closest("[role=row]")).toHaveFocus();
  });

  it("opens as a bottom sheet on a phone", async () => {
    mockApi([task({ id: 1, title: "Buy milk" })]);
    const user = renderList({ wide: false });

    const sheet = await openTask(user, "Buy milk");

    expect(within(sheet).getByRole("textbox", { name: "Title" })).toHaveValue("Buy milk");
  });

  it("shows the Task's history, newest first, in the Activity tab", async () => {
    mockApi(
      [task({ id: 1, title: "Buy oat milk" })],
      [
        { id: 3, kind: "description_edited", at: minutesAgo(2), data: {} },
        {
          id: 2,
          kind: "title_changed",
          at: minutesAgo(5),
          data: { old: "Buy milk", new: "Buy oat milk" },
        },
        { id: 1, kind: "created", at: minutesAgo(10), data: {} },
      ],
    );
    const user = renderList();
    const drawer = await openTask(user, "Buy oat milk");

    await user.click(await within(drawer).findByRole("tab", { name: "Activity 3" }));

    const events = within(within(drawer).getByRole("tabpanel")).getAllByRole("listitem");
    expect(events.map((event) => event.textContent)).toEqual([
      "Edited the description2 minutes ago",
      "Renamed from “Buy milk” to “Buy oat milk”5 minutes ago",
      "Created this task10 minutes ago",
    ]);
  });

  it("ends the Details tab with the Comments it counts, and pins the composer below", async () => {
    const at = minutesAgo(5);
    const note = { task_id: 1, created_at: at, updated_at: at };
    mockApi(
      [task({ id: 1, title: "Buy milk" })],
      [],
      [
        { ...note, id: 1, body: "Oat milk" },
        { ...note, id: 2, body: "Two litres" },
      ],
    );
    const user = renderList();

    const drawer = await openTask(user, "Buy milk");

    const details = await within(drawer).findByRole("tab", { name: "Details 2 comments" });
    expect(
      within(drawer)
        .getAllByRole("article")
        .map((card) => card.textContent),
    ).toEqual([expect.stringContaining("Oat milk"), expect.stringContaining("Two litres")]);
    expect(within(drawer).getByRole("textbox", { name: "Write a comment" })).toBeInTheDocument();
    await user.click(within(drawer).getByRole("tab", { name: /Activity/ }));
    expect(within(drawer).queryByRole("textbox", { name: "Write a comment" })).toBeNull();
    await user.click(details);
    expect(within(drawer).getByRole("textbox", { name: "Write a comment" })).toBeInTheDocument();
  });

  it("counts a rename in the Activity tab straight away", async () => {
    mockApi(
      [task({ id: 1, title: "Buy milk" })],
      [{ id: 1, kind: "created", at: minutesAgo(10), data: {} }],
    );
    const user = renderList();
    const drawer = await openTask(user, "Buy milk");
    expect(await within(drawer).findByRole("tab", { name: "Activity 1" })).toBeInTheDocument();
    const title = within(drawer).getByRole("textbox", { name: "Title" });

    await user.clear(title);
    await user.type(title, "Buy oat milk{Enter}");

    expect(await within(drawer).findByRole("tab", { name: "Activity 2" })).toBeInTheDocument();
  });
});
