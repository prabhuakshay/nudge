import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

import { AppShell } from "./app-shell";

vi.mock("./sidebar", () => ({ Sidebar: () => null }));
vi.mock("./bottom-nav", () => ({ BottomNav: () => null }));
vi.mock("./mobile-menu", () => ({ MobileMenu: () => null }));
vi.mock("@/features/notifications/notification-center", () => ({
  NotificationCenter: () => null,
}));
vi.mock("@/features/settings/settings-dialog", () => ({ SettingsDialog: () => null }));
vi.mock("@/features/theme/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/features/time-zone/time-zone-banner", () => ({ TimeZoneBanner: () => null }));
vi.mock("@/features/tasks/global-quick-add", () => ({ GlobalQuickAdd: () => null }));

const ada = {
  id: 1,
  email: "ada@example.com",
  full_name: "Ada Lovelace",
  time_zone: "Europe/London",
};

function DeleteButton({ onUndo }: { onUndo: () => void }) {
  return (
    <button
      type="button"
      onClick={() => toast("Task deleted", { action: { label: "Undo", onClick: onUndo } })}
    >
      Delete
    </button>
  );
}

describe("AppShell", () => {
  it("shows a toast raised by any page and runs its action", async () => {
    const onUndo = vi.fn();
    render(
      <AppShell user={ada}>
        <DeleteButton onUndo={onUndo} />
      </AppShell>,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Task deleted")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledOnce();
  });
});
