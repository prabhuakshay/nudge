import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { sessionQuery, type User } from "@/features/auth/session";

import { useShortcuts, type ShortcutHandlers } from "./use-shortcuts";

const ada = {
  id: 1,
  email: "ada@example.com",
  full_name: "Ada Lovelace",
  time_zone: "Europe/London",
  single_key_shortcuts: true,
};

function Bound({ handlers }: { handlers: ShortcutHandlers }) {
  useShortcuts(handlers);
  return <input aria-label="Title" />;
}

function renderBound(handlers: ShortcutHandlers, singleKey = true) {
  const queryClient = new QueryClient();
  const user: User = { ...ada, single_key_shortcuts: singleKey };
  queryClient.setQueryData(sessionQuery.queryKey, user);
  render(
    <QueryClientProvider client={queryClient}>
      <Bound handlers={handlers} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useShortcuts", () => {
  it("runs a shortcut's handler when its key is pressed", async () => {
    const user = userEvent.setup();
    const quickAdd = vi.fn();
    renderBound({ quickAdd });

    await user.keyboard("c");

    expect(quickAdd).toHaveBeenCalledOnce();
  });

  it("leaves keys to a text field, except Esc", async () => {
    const user = userEvent.setup();
    const quickAdd = vi.fn();
    const back = vi.fn();
    const undo = vi.fn();
    renderBound({ quickAdd, back, undo });

    await user.click(screen.getByRole("textbox", { name: "Title" }));
    await user.keyboard("c{Control>}z{/Control}{Escape}");

    expect(quickAdd).not.toHaveBeenCalled();
    expect(undo).not.toHaveBeenCalled();
    expect(back).toHaveBeenCalledOnce();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("c");
  });

  it("navigates with G then a key, without firing that key's own shortcut", async () => {
    const user = userEvent.setup();
    const goToToday = vi.fn();
    const addTag = vi.fn();
    renderBound({ goToToday, addTag });

    await user.keyboard("gt");

    expect(goToToday).toHaveBeenCalledOnce();
    expect(addTag).not.toHaveBeenCalled();
  });

  it("forgets a G press after a second", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    const goToInbox = vi.fn();
    renderBound({ goToInbox });

    await user.keyboard("g");
    vi.advanceTimersByTime(1100);
    await user.keyboard("i");

    expect(goToInbox).not.toHaveBeenCalled();
  });

  it("turns off single-key shortcuts, but not modified or non-character keys", async () => {
    const user = userEvent.setup();
    const handlers = { quickAdd: vi.fn(), goToInbox: vi.fn(), undo: vi.fn(), nextTask: vi.fn() };
    renderBound(handlers, false);

    await user.keyboard("cgij{Control>}z{/Control}{ArrowDown}");

    expect(handlers.quickAdd).not.toHaveBeenCalled();
    expect(handlers.goToInbox).not.toHaveBeenCalled();
    expect(handlers.undo).toHaveBeenCalledOnce();
    expect(handlers.nextTask).toHaveBeenCalledOnce();
  });
});
