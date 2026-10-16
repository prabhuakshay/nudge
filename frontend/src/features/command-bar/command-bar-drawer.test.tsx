import { screen } from "@testing-library/react";

import { TaskList } from "@/features/tasks/task-list";
import { OpenableCommandBar } from "@/test/command-bar";
import { INBOX, mockApi, openTask, renderListRoute, task } from "@/test/drawer";

/** The Inbox with the command bar over it, on a wide screen. */
function renderInbox() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    matches: true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  return renderListRoute(
    <>
      <TaskList project={INBOX} />
      <OpenableCommandBar actions={{}} onCreateTask={vi.fn()} />
    </>,
  ).user;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the command bar over the drawer", () => {
  it("opens the open Task's date picker in the drawer", async () => {
    mockApi([task({ id: 1, title: "Buy milk" })]);
    const user = renderInbox();
    await openTask(user, "Buy milk");

    await user.keyboard("{Control>}k{/Control}");
    await user.keyboard("set date{Enter}");

    expect(await screen.findByRole("dialog", { name: "Date" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Command bar" })).not.toBeInTheDocument();
  });

  it("opens the focused row's Task in the drawer", async () => {
    mockApi([task({ id: 1, title: "Buy milk" })]);
    const user = renderInbox();
    (await screen.findByRole("row", { name: /Buy milk/ })).focus();

    await user.keyboard("/");
    await user.keyboard("open{Enter}");

    expect(await screen.findByRole("dialog", { name: "Task details" })).toBeInTheDocument();
  });
});
