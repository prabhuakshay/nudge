import { screen, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";

import { mockApi, patches, renderList, task } from "@/test/drawer";

const PRIYA = "[@Priya](person:1)";

/** Open the Task whose row title starts with `text`; Mention chips split the title's text. */
async function openTask(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(await screen.findByText(text, { exact: false }));
  return screen.findByRole("dialog", { name: "Task details" });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Mentions in Tasks", () => {
  it("shows Mentions in a row's title and Blocked reason as chips", async () => {
    mockApi([
      task({ id: 1, title: `Call ${PRIYA}`, status: "blocked", blocked_reason: `Ask ${PRIYA}` }),
    ]);
    renderList();

    const row = (await screen.findByText("Call", { exact: false })).closest("[role=row]");
    expect(row).not.toBeNull();
    const chips = row?.querySelectorAll("[data-mention]") ?? [];
    expect(chips.length).toBeGreaterThanOrEqual(2);
    expect(row).not.toHaveTextContent("person:1");
  });

  it("edits a title's Mentions as @Name and saves them back as Mentions", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: `Call ${PRIYA}` })]);
    const user = renderList();
    const drawer = await openTask(user, "Call");
    const title = await within(drawer).findByRole("textbox", { name: "Title" });
    expect(title).toHaveValue("Call @Priya");

    await user.type(title, " and @priya's mum{Enter}");

    expect(await patches(fetchSpy)).toEqual([
      ["/api/v1/tasks/1", { title: `Call ${PRIYA} and ${PRIYA}'s mum` }],
    ]);
  });

  it("leaves an unchanged title with Mentions unsaved", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: `Call ${PRIYA}` })]);
    const user = renderList();
    const drawer = await openTask(user, "Call");
    await within(drawer).findByRole("textbox", { name: "Title" });

    await user.click(within(drawer).getByRole("textbox", { name: "Title" }));
    await user.keyboard("{Enter}");

    expect(await patches(fetchSpy)).toEqual([]);
  });

  it("mentions a Person typed with @ in the Blocked reason", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: "Fix the boiler", status: "blocked" })]);
    const user = renderList();
    const drawer = await openTask(user, "Fix the boiler");

    await user.type(
      within(drawer).getByRole("textbox", { name: "Blocked reason" }),
      "Waiting on @Priya{Enter}",
    );

    expect(await patches(fetchSpy)).toEqual([
      ["/api/v1/tasks/1", { blocked_reason: `Waiting on ${PRIYA}` }],
    ]);
  });

  it("shows Mentions in the Description as chips and edits them as @Name", async () => {
    mockApi([task({ id: 1, title: "Plan", description: `Ask **${PRIYA}** first` })]);
    const user = renderList();
    const drawer = await openTask(user, "Plan");

    const chip = await within(drawer).findByText("Priya");
    expect(chip.closest("[data-mention]")).not.toBeNull();
    await user.click(within(drawer).getByRole("button", { name: "Edit description" }));

    expect(within(drawer).getByRole("textbox", { name: "Description" })).toHaveValue(
      "Ask **@Priya** first",
    );
  });
});
