import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { requestOf } from "@/test/fetch";
import { ChangePasswordForm } from "./change-password-form";

function renderForm({ onSuccess = vi.fn(), onCancel = vi.fn() } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChangePasswordForm onSuccess={onSuccess} onCancel={onCancel} />
    </QueryClientProvider>,
  );
}

function mockFetch(status: number, body?: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

async function submit(current: string, next: string, confirm = next) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Current password"), current);
  await user.type(screen.getByLabelText("New password"), next);
  await user.type(screen.getByLabelText("Confirm new password"), confirm);
  await user.click(screen.getByRole("button", { name: "Save" }));
}

describe("ChangePasswordForm", () => {
  it("changes the password and reports success", async () => {
    const fetchSpy = mockFetch(204);
    const onSuccess = vi.fn();
    renderForm({ onSuccess });

    await submit("old-passphrase", "new-passphrase");

    await vi.waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
    const request = requestOf(fetchSpy.mock.calls[0]?.[0]);
    expect(request.url).toMatch(/\/api\/v1\/auth\/password$/);
    expect(await request.json()).toEqual({
      current_password: "old-passphrase",
      new_password: "new-passphrase",
    });
  });

  it("cancels without calling the server", async () => {
    const fetchSpy = mockFetch(204);
    const onCancel = vi.fn();
    renderForm({ onCancel });

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("stops when the new passwords don't match", async () => {
    const fetchSpy = mockFetch(204);
    renderForm();

    await submit("old-passphrase", "new-passphrase", "new-passphrasf");

    expect(await screen.findByRole("alert")).toHaveTextContent("don't match");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows the server's message when the change is refused", async () => {
    mockFetch(400, { detail: "Your current password is incorrect." });
    renderForm();

    await submit("wrong", "new-passphrase");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your current password is incorrect.",
    );
    expect(screen.getByLabelText("Current password")).toHaveAttribute("aria-invalid", "true");
  });

  it("asks the user to wait when rate limited", async () => {
    mockFetch(429, { detail: "Too many requests" });
    renderForm();

    await submit("wrong", "new-passphrase");

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts");
  });
});
