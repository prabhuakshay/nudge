import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { LoginForm } from "./login-form";

function renderWithQueryClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

async function signIn(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("LoginForm", () => {
  it("signs in and reports the user", async () => {
    const ada = { id: 1, email: "ada@example.com", full_name: "Ada Lovelace" };
    const fetchSpy = mockFetch(200, ada);
    const onSuccess = vi.fn();
    renderWithQueryClient(<LoginForm onSuccess={onSuccess} />);

    await signIn("ada@example.com", "correct-horse");

    await vi.waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(ada, expect.anything(), undefined, expect.anything());
    });
    const request = fetchSpy.mock.calls[0]?.[0] as Request;
    expect(request.url).toMatch(/\/api\/v1\/auth\/login$/);
    expect(await request.json()).toEqual({ email: "ada@example.com", password: "correct-horse" });
  });

  it("shows the server's message when the credentials are wrong", async () => {
    mockFetch(401, { detail: "That email and password don't match an account." });
    renderWithQueryClient(<LoginForm onSuccess={vi.fn()} />);

    await signIn("ada@example.com", "wrong");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That email and password don't match an account.",
    );
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("asks the user to wait when rate limited", async () => {
    mockFetch(429, { detail: "Too many requests" });
    renderWithQueryClient(<LoginForm onSuccess={vi.fn()} />);

    await signIn("ada@example.com", "wrong");

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts");
  });

  it("explains when the server can't be reached", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    renderWithQueryClient(<LoginForm onSuccess={vi.fn()} />);

    await signIn("ada@example.com", "correct-horse");

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach the server");
  });
});
