import { screen, within } from "@testing-library/react";

import { mockApi, openTask, patches, renderList, TAGS, task } from "@/test/drawer";
import { requestOf } from "@/test/fetch";

const [WORK_TAG, HOME_TAG] = TAGS as [(typeof TAGS)[number], (typeof TAGS)[number]];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Tags in the list", () => {
  it("takes a Tag off from the row's Tags cell without opening the Task", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: "Report", tags: [WORK_TAG, HOME_TAG] })]);
    const user = renderList();

    await user.click(await screen.findByRole("button", { name: "Tags: work, home" }));
    await user.click(await screen.findByRole("option", { name: /work/ }));

    expect(await screen.findByRole("button", { name: "Tags: home" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Task details" })).toBeNull();
    expect(await patches(fetchSpy)).toEqual([["/api/v1/tasks/1", { tag_ids: [HOME_TAG.id] }]]);
  });
});

describe("Tags in the drawer", () => {
  it("shows the Task's Tags as chips and takes one off with its ×", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: "Report", tags: [WORK_TAG, HOME_TAG] })]);
    const user = renderList();
    const drawer = await openTask(user, "Report");

    await user.click(within(drawer).getByRole("button", { name: "Remove tag work" }));

    expect(within(drawer).queryByRole("button", { name: "Remove tag work" })).toBeNull();
    expect(within(drawer).getByRole("button", { name: "Remove tag home" })).toBeVisible();
    expect(await patches(fetchSpy)).toEqual([["/api/v1/tasks/1", { tag_ids: [HOME_TAG.id] }]]);
  });

  it("puts a Tag on the Task from the picker", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: "Report" })]);
    const user = renderList();
    const drawer = await openTask(user, "Report");

    await user.click(within(drawer).getByRole("button", { name: "Add tag" }));
    await user.click(await screen.findByRole("option", { name: "home" }));

    expect(await within(drawer).findByRole("button", { name: "Remove tag home" })).toBeVisible();
    expect(await patches(fetchSpy)).toEqual([["/api/v1/tasks/1", { tag_ids: [HOME_TAG.id] }]]);
  });

  it("creates a Tag the user doesn't have and puts it on the Task", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: "Report" })]);
    const user = renderList();
    const drawer = await openTask(user, "Report");

    await user.click(within(drawer).getByRole("button", { name: "Add tag" }));
    await user.type(screen.getByPlaceholderText("Find or create a tag…"), "urgent");
    await user.click(await screen.findByRole("option", { name: "Create “urgent”" }));

    expect(await within(drawer).findByRole("button", { name: "Remove tag urgent" })).toBeVisible();
    const created = fetchSpy.mock.calls
      .map(([input]) => requestOf(input))
      .find((request) => request.method === "POST");
    expect(created && (await created.json())).toEqual({ name: "urgent", color: null });
  });

  it("won't offer to create a Tag with a space in its name", async () => {
    mockApi([task({ id: 1, title: "Report" })]);
    const user = renderList();
    const drawer = await openTask(user, "Report");

    await user.click(within(drawer).getByRole("button", { name: "Add tag" }));
    await user.type(screen.getByPlaceholderText("Find or create a tag…"), "two words");

    expect(await screen.findByText("Tag names can't have spaces or #.")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Create/ })).toBeNull();
  });
});
