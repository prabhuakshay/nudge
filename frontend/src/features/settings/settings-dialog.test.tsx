import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SettingsDialog } from "./settings-dialog";

vi.mock("@/features/auth/sign-out-button", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));

const ada = {
  id: 1,
  email: "ada@example.com",
  full_name: "Ada Lovelace",
  time_zone: "Europe/London",
  single_key_shortcuts: true,
  projects_collapsed: true,
  tags_collapsed: true,
  people_collapsed: true,
};

async function openDialog() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SettingsDialog user={ada}>
        <button type="button">Open settings</button>
      </SettingsDialog>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open settings" }));
  return user;
}

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("SettingsDialog", () => {
  it("opens on the profile", async () => {
    await openDialog();

    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ada Lovelace/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("opens a page from the list and goes back", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    expect(screen.getByRole("region", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByText("Push notifications")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("region", { name: "Profile" })).toBeInTheDocument();
  });

  it("edits the name in place", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Full name")).toHaveValue("Ada Lovelace");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument();
  });

  it("changes the password in place", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const user = await openDialog();
    await user.click(screen.getByRole("button", { name: /Password/ }));

    await user.click(screen.getByRole("button", { name: "Change password" }));
    await user.type(screen.getByLabelText("Current password"), "old-passphrase");
    await user.type(screen.getByLabelText("New password"), "new-passphrase");
    await user.type(screen.getByLabelText("Confirm new password"), "new-passphrase");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Changed");
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
  });

  it("shows the theme beside Appearance and changes it there", async () => {
    const user = await openDialog();
    const appearance = screen.getByRole("button", { name: /Appearance/ });
    expect(appearance).toHaveTextContent("System");

    await user.click(appearance);
    await user.click(screen.getByRole("radio", { name: "Dark" }));

    expect(appearance).toHaveTextContent("Dark");
  });

  it("shows the time zone beside Time zone and opens its page", async () => {
    const user = await openDialog();
    const timeZone = screen.getByRole("button", { name: /Time zone/ });
    expect(timeZone).toHaveTextContent("Europe/London");

    await user.click(timeZone);

    expect(screen.getByRole("region", { name: "Time zone" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
  });

  it("opens the Calendar feed page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ url: null }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: /Calendar feed/ }));

    expect(screen.getByRole("region", { name: "Calendar feed" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Turn on" })).toBeInTheDocument();
  });

  it("closes with Escape", async () => {
    const user = await openDialog();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
