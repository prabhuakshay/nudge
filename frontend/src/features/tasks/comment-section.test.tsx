import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { json, minutesAgo, PRIYA } from "@/test/drawer";

import { CommentComposer, Comments } from "./comment-section";
import type { Comment } from "./comments";

function comment(overrides: Partial<Comment>): Comment {
  const at = minutesAgo(5);
  return {
    id: 1,
    task_id: 7,
    body: "Booked the train",
    created_at: at,
    updated_at: at,
    ...overrides,
  };
}

/** A stand-in for the server holding one Task's Comments, which saves writes to them. */
function mockApi(stored: Comment[]) {
  let nextId = 100;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = input as Request;
    const url = new URL(request.url);
    if (url.pathname.endsWith("/people")) return json([PRIYA]);
    if (url.pathname.endsWith("/session")) {
      return json({ user: { email: "ada@example.com", full_name: "Ada Lovelace" } });
    }
    const id = Number(url.pathname.split("/").at(-1));
    if (request.method === "POST") {
      const { body } = (await request.clone().json()) as { body: string };
      if (body.startsWith("Refused")) return json({ detail: "Unknown person." }, 422);
      const created = comment({ id: nextId++, body, created_at: minutesAgo(0) });
      stored = [...stored, { ...created, updated_at: created.created_at }];
      return json(created, 201);
    }
    if (request.method === "PATCH") {
      const { body } = (await request.clone().json()) as { body: string };
      stored = stored.map((item) =>
        item.id === id ? { ...item, body, updated_at: minutesAgo(0) } : item,
      );
      return json(stored.find((item) => item.id === id));
    }
    if (request.method === "DELETE") {
      stored = stored.filter((item) => item.id !== id);
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return json(stored);
  });
}

async function writes(fetchSpy: ReturnType<typeof mockApi>) {
  const requests = fetchSpy.mock.calls
    .map(([input]) => input as Request)
    .filter((request) => request.method !== "GET");
  return Promise.all(
    requests.map(async (request) => {
      const path = `${request.method} ${new URL(request.url).pathname}`;
      return request.method === "DELETE"
        ? [path]
        : [path, (await request.clone().json()) as unknown];
    }),
  );
}

function renderComments() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <Comments taskId={7} />
        <CommentComposer taskId={7} />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe("Comments", () => {
  it("shows each Comment as a card from You, with its time and whether it was edited", async () => {
    mockApi([
      comment({ id: 1, body: "Booked the **train**" }),
      comment({
        id: 2,
        body: `Ask [@Priya](person:${String(PRIYA.id)})`,
        updated_at: minutesAgo(1),
      }),
    ]);
    renderComments();

    const cards = await screen.findAllByRole("article");
    expect(cards).toHaveLength(2);
    const [first, second] = cards as [HTMLElement, HTMLElement];
    expect(within(first).getByText("You")).toBeInTheDocument();
    expect(within(first).getByText("5 minutes ago")).toBeInTheDocument();
    expect(within(first).getByText("train").tagName).toBe("STRONG");
    expect(within(first).queryByText(/edited/)).not.toBeInTheDocument();
    expect(within(second).getByText(/edited/)).toBeInTheDocument();
    expect(second.querySelector("[data-mention]")).toHaveTextContent("Priya");
  });

  it("says so when there are no Comments yet", async () => {
    mockApi([]);
    renderComments();

    expect(await screen.findByText("No comments yet")).toBeInTheDocument();
  });

  it("sends a Comment with the button, turning @Name into a Mention", async () => {
    const fetchSpy = mockApi([]);
    const user = renderComments();
    const composer = screen.getByRole("textbox", { name: "Write a comment" });

    expect(screen.getByRole("button", { name: "Send comment" })).toBeDisabled();
    await user.type(composer, "Ask @Priya");
    await user.click(screen.getByRole("button", { name: "Send comment" }));

    const card = await screen.findByRole("article");
    expect(card.querySelector("[data-mention]")).toHaveTextContent("Priya");
    expect(composer).toHaveValue("");
    expect(await writes(fetchSpy)).toEqual([
      ["POST /api/v1/tasks/7/comments", { body: "Ask [@Priya](person:1)" }],
    ]);
  });

  it("sends with Ctrl+Enter or Cmd+Enter, while Enter alone starts a new line", async () => {
    const fetchSpy = mockApi([]);
    const user = renderComments();
    const composer = screen.getByRole("textbox", { name: "Write a comment" });

    await user.type(composer, "First line{Enter}second line{Control>}{Enter}{/Control}");
    await user.type(composer, "Another{Meta>}{Enter}{/Meta}");

    await waitFor(() => {
      expect(screen.getAllByRole("article")).toHaveLength(2);
    });
    expect(await writes(fetchSpy)).toEqual([
      ["POST /api/v1/tasks/7/comments", { body: "First line\nsecond line" }],
      ["POST /api/v1/tasks/7/comments", { body: "Another" }],
    ]);
  });

  it("keeps the draft and shows the reason when the server refuses a Comment", async () => {
    mockApi([]);
    const user = renderComments();
    const composer = screen.getByRole("textbox", { name: "Write a comment" });

    await user.type(composer, "Refused{Control>}{Enter}{/Control}");

    expect(await screen.findByText("Unknown person.")).toBeInTheDocument();
    expect(composer).toHaveValue("Refused");
  });

  it("edits a Comment in place, saving when the field loses focus", async () => {
    const fetchSpy = mockApi([comment({ id: 1, body: "Ask [@Priya](person:1)" })]);
    const user = renderComments();

    await user.click(await screen.findByRole("button", { name: "Edit comment" }));
    const field = screen.getByRole("textbox", { name: "Edit comment" });
    expect(field).toHaveFocus();
    expect(field).toHaveValue("Ask @Priya");
    await user.clear(field);
    await user.type(field, "Ask @Priya again");
    await user.tab();

    expect(await screen.findByText(/edited/)).toBeInTheDocument();
    expect(await writes(fetchSpy)).toEqual([
      ["PATCH /api/v1/comments/1", { body: "Ask [@Priya](person:1) again" }],
    ]);
  });

  it("drops an edit on Escape", async () => {
    const fetchSpy = mockApi([comment({ id: 1 })]);
    const user = renderComments();

    await user.click(await screen.findByRole("button", { name: "Edit comment" }));
    await user.type(screen.getByRole("textbox", { name: "Edit comment" }), " and back{Escape}");

    expect(screen.getByRole("article")).toHaveTextContent("Booked the train");
    expect(screen.queryByRole("textbox", { name: "Edit comment" })).not.toBeInTheDocument();
    expect(await writes(fetchSpy)).toEqual([]);
  });

  it("deletes a Comment straight away", async () => {
    const fetchSpy = mockApi([comment({ id: 1 })]);
    const user = renderComments();

    await user.click(await screen.findByRole("button", { name: "Delete comment" }));

    expect(await screen.findByText("No comments yet")).toBeInTheDocument();
    expect(await writes(fetchSpy)).toEqual([["DELETE /api/v1/comments/1"]]);
  });
});
