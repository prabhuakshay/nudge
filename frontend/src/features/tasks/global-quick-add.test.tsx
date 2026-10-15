import { screen, waitFor } from "@testing-library/react";
import { useState } from "react";

import { INBOX, json, renderListRoute } from "@/test/drawer";
import { makeTask } from "@/test/tasks";

import { GlobalQuickAdd } from "./global-quick-add";
import { TaskList } from "./task-list";
import type { NewTask } from "./tasks";

/** A stand-in server with an empty Inbox that logs each Task added. */
function mockApi() {
  const added: unknown[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = input as Request;
    const { pathname } = new URL(request.url);
    if (pathname.endsWith("/sidebar")) {
      return json({ inbox: INBOX, items: [], archived: [], tags: [], people: [] });
    }
    if (request.method === "POST") {
      const body = (await request.json()) as NewTask;
      added.push(body);
      return json(makeTask({ id: 50, title: body.title, project_id: INBOX.id }), 201);
    }
    return json({ items: [], next_cursor: null });
  });
  return added;
}

/** The dialog as the app hosts it, closed unless a draft is given. */
function Host({ draft = null }: { draft?: string | null }) {
  const [shown, setShown] = useState(draft);
  return <GlobalQuickAdd draft={shown} onDraftChange={setShown} />;
}

describe("GlobalQuickAdd", () => {
  it("opens Quick add in a dialog on C where the page has none, and adds to the Inbox", async () => {
    const added = mockApi();
    const { user } = renderListRoute(<Host />);

    await user.keyboard("c");
    const field = await screen.findByRole("combobox", { name: "New task" });
    expect(field).toHaveFocus();
    await user.type(field, "Pay rent !1{Enter}");

    await waitFor(() => {
      expect(added).toEqual([{ title: "Pay rent", project_id: INBOX.id, priority: 1 }]);
    });
    expect(await screen.findByText("Added to Inbox")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Add a task" })).not.toBeInTheDocument();
  });

  it("leaves C to the page's own Quick add", async () => {
    mockApi();
    const { user } = renderListRoute(
      <>
        <TaskList project={INBOX} />
        <Host />
      </>,
    );
    const field = await screen.findByRole("combobox", { name: "New task" });

    await user.keyboard("c");

    expect(field).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens with a draft already typed, read as Quick add reads it", async () => {
    const added = mockApi();
    const { user } = renderListRoute(<Host draft="Water plants !2" />);

    const field = await screen.findByRole("combobox", { name: "New task" });
    expect(field).toHaveValue("Water plants !2");
    await user.type(field, "{Enter}");

    await waitFor(() => {
      expect(added).toEqual([{ title: "Water plants", project_id: INBOX.id, priority: 2 }]);
    });
  });
});
