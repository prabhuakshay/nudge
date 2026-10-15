import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

import { requestOf } from "@/test/fetch";
import { Attachments } from "./attachments";
import type { Attachment } from "./tasks";

function attachment(overrides: Partial<Attachment>): Attachment {
  return {
    id: 1,
    name: "receipt.pdf",
    size: 2048,
    content_type: "application/pdf",
    created_at: "2026-10-15T09:00:00Z",
    ...overrides,
  };
}

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

/**
 * A stand-in for the server holding one Task's Attachments. jsdom's File can't be read back out of
 * a multipart request body, so each upload takes the next name from `uploads`; "huge.bin" is
 * refused as too large.
 */
function mockApi(stored: Attachment[], uploads: string[] = []) {
  let nextId = 100;
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const request = requestOf(input);
    const url = new URL(request.url);
    if (request.method === "POST") {
      const name = uploads.shift() ?? "file";
      if (name === "huge.bin") {
        return json({ detail: "Files can be at most 25.0 MB." }, 413);
      }
      const created = attachment({ id: nextId++, name });
      stored = [...stored, created];
      return json(created, 201);
    }
    if (request.method === "DELETE") {
      const id = Number(url.pathname.split("/").at(-1));
      stored = stored.filter((item) => item.id !== id);
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return json(stored);
  });
}

function writes(fetchSpy: ReturnType<typeof mockApi>) {
  return fetchSpy.mock.calls
    .map(([input]) => requestOf(input))
    .filter((request) => request.method !== "GET")
    .map((request) => {
      const type = request.headers.get("Content-Type")?.split(";")[0] ?? "";
      return `${request.method} ${new URL(request.url).pathname} ${type}`.trim();
    });
}

function renderAttachments() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Attachments taskId={7} />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe("Attachments", () => {
  it("shows images as thumbnails and other files as chips, each linked to its download", async () => {
    mockApi([
      attachment({ id: 1, name: "photo.png", content_type: "image/png" }),
      attachment({ id: 2, name: "receipt.pdf", size: 2_621_440 }),
      attachment({ id: 3, name: "logo.svg", content_type: "image/svg+xml", size: 300 }),
    ]);

    renderAttachments();

    const photo = await screen.findByRole("img", { name: "photo.png" });
    expect(photo).toHaveAttribute("src", "/api/v1/attachments/1/download");
    expect(screen.getByRole("link", { name: /receipt\.pdf/ })).toHaveAttribute(
      "href",
      "/api/v1/attachments/2/download",
    );
    expect(screen.getByText("PDF · 2.5 MB")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "logo.svg" })).not.toBeInTheDocument();
    expect(screen.getByText("Image · 300 B")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("uploads each picked file in its own multipart request and lists it", async () => {
    const fetchSpy = mockApi([], ["one.txt", "two.txt"]);
    const user = renderAttachments();

    await user.upload(screen.getByLabelText("Attach files"), [
      new File(["a"], "one.txt", { type: "text/plain" }),
      new File(["bb"], "two.txt", { type: "text/plain" }),
    ]);

    expect(await screen.findByRole("link", { name: /two\.txt/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /one\.txt/ })).toBeInTheDocument();
    expect(writes(fetchSpy)).toEqual([
      "POST /api/v1/tasks/7/attachments multipart/form-data",
      "POST /api/v1/tasks/7/attachments multipart/form-data",
    ]);
  });

  it("uploads files dropped on the drop zone", async () => {
    const fetchSpy = mockApi([], ["dropped.txt"]);
    renderAttachments();
    const zone = await screen.findByRole("button", { name: "Drop files or browse" });

    fireEvent.drop(zone, {
      dataTransfer: { files: [new File(["a"], "dropped.txt", { type: "text/plain" })] },
    });

    expect(await screen.findByRole("link", { name: /dropped\.txt/ })).toBeInTheDocument();
    expect(writes(fetchSpy)).toEqual(["POST /api/v1/tasks/7/attachments multipart/form-data"]);
  });

  it("shows the server's reason when it refuses a file", async () => {
    mockApi([], ["huge.bin"]);
    const error = vi.spyOn(toast, "error");
    const user = renderAttachments();

    await user.upload(screen.getByLabelText("Attach files"), new File(["x"], "huge.bin"));

    await vi.waitFor(() => {
      expect(error).toHaveBeenCalledWith("Files can be at most 25.0 MB.");
    });
  });

  it("deletes an attachment", async () => {
    const fetchSpy = mockApi([attachment({ id: 4, name: "old.pdf" })]);
    const user = renderAttachments();

    await user.click(await screen.findByRole("button", { name: "Delete old.pdf" }));

    expect(screen.queryByRole("link", { name: /old\.pdf/ })).not.toBeInTheDocument();
    expect(writes(fetchSpy)).toEqual(["DELETE /api/v1/attachments/4"]);
  });
});
