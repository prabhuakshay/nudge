import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SettingsDialog } from "./settings-dialog";

vi.mock("@/features/auth/sign-out-button", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));

const ada = { id: 1, email: "ada@example.com", full_name: "Ada Lovelace" };

function renderDialog() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SettingsDialog user={ada}>
        <button type="button">Open settings</button>
      </SettingsDialog>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe("SettingsDialog", () => {
  it("opens on the account tab", async () => {
    const user = renderDialog();

    await user.click(screen.getByRole("button", { name: "Open settings" }));

    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Account" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
  });

  it("changes the password in a dialog of its own", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const user = renderDialog();
    await user.click(screen.getByRole("button", { name: "Open settings" }));

    await user.click(screen.getByRole("button", { name: "Change password" }));
    await user.type(screen.getByLabelText("Current password"), "old-passphrase");
    await user.type(screen.getByLabelText("New password"), "new-passphrase");
    await user.type(screen.getByLabelText("Confirm new password"), "new-passphrase");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Changed");
    expect(screen.queryByRole("dialog", { name: "Change password" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
  });

  it("closes with Escape", async () => {
    const user = renderDialog();
    await user.click(screen.getByRole("button", { name: "Open settings" }));

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
