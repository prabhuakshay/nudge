import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EditNameForm } from "./edit-name-form";
import { sessionQuery } from "./session";

const ada = {
  id: 1,
  email: "ada@example.com",
  full_name: "Ada Lovelace",
  time_zone: "Europe/London",
  single_key_shortcuts: true,
};

function renderForm({ onSuccess = vi.fn(), onCancel = vi.fn() } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  queryClient.setQueryData(sessionQuery.queryKey, ada);
  render(
    <QueryClientProvider client={queryClient}>
      <EditNameForm fullName={ada.full_name} onSuccess={onSuccess} onCancel={onCancel} />
    </QueryClientProvider>,
  );
  return queryClient;
}

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

async function rename(name: string) {
  const user = userEvent.setup();
  const input = screen.getByLabelText("Full name");
  await user.clear(input);
  await user.type(input, name);
  await user.click(screen.getByRole("button", { name: "Save" }));
}

describe("EditNameForm", () => {
  it("starts with the current name", () => {
    renderForm();
    expect(screen.getByLabelText("Full name")).toHaveValue("Ada Lovelace");
  });

  it("saves the name and updates the signed-in user", async () => {
    const renamed = { ...ada, full_name: "Augusta Ada King" };
    const fetchSpy = mockFetch(200, renamed);
    const onSuccess = vi.fn();
    const queryClient = renderForm({ onSuccess });

    await rename("Augusta Ada King");

    await vi.waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
    const request = fetchSpy.mock.calls[0]?.[0] as Request;
    expect(request.method).toBe("PATCH");
    expect(await request.json()).toEqual({ full_name: "Augusta Ada King" });
    expect(queryClient.getQueryData(sessionQuery.queryKey)).toEqual(renamed);
  });

  it("explains when the name couldn't be saved", async () => {
    mockFetch(500, {});
    const onSuccess = vi.fn();
    renderForm({ onSuccess });

    await rename("Augusta Ada King");

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save your name");
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
