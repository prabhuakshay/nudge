import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WORK, renderTaskList } from "@/test/drawer";
import { DOING, TO_DO, mockApi, titlesIn, writes } from "@/test/sections";
import { makeTask } from "@/test/tasks";

import { SectionGroup } from "./section-group";

describe("A Section's header", () => {
  it("collapses and expands a Section from its header, keeping its open-Task count", async () => {
    const fetchSpy = mockApi({
      open: [
        makeTask({ id: 1, project_id: WORK.id, title: "Write brief", section_id: TO_DO.id }),
        makeTask({ id: 2, project_id: WORK.id, title: "Plan launch", section_id: TO_DO.id }),
      ],
    });
    const { user } = renderTaskList({ project: WORK });
    const toggle = await screen.findByRole("button", { name: "To do", expanded: true });
    const toDo = screen.getByRole("region", { name: "To do" });
    expect(within(toDo).getByText("2")).toBeInTheDocument();

    toggle.focus();
    await user.keyboard("{Enter}");

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(titlesIn("To do")).toEqual([]);
    expect(within(toDo).getByText("2")).toBeInTheDocument();

    await user.keyboard("{Enter}");

    expect(titlesIn("To do")).toEqual(["Write brief", "Plan launch"]);
    await waitFor(async () => {
      expect(await writes(fetchSpy)).toEqual([
        [`PATCH /api/v1/sections/${String(TO_DO.id)}`, { collapsed: true }],
        [`PATCH /api/v1/sections/${String(TO_DO.id)}`, { collapsed: false }],
      ]);
    });
  });

  it("can't collapse a read-only Section, so it never changes it on the server", async () => {
    const fetchSpy = mockApi({});
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SectionGroup section={TO_DO} count={0} readOnly />
      </QueryClientProvider>,
    );
    const toggle = screen.getByRole("button", { name: "To do", expanded: true });

    await user.click(toggle);

    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(await writes(fetchSpy)).toEqual([]);
  });

  it("shows a Section collapsed when the server remembers it so", async () => {
    mockApi({
      sections: [{ ...TO_DO, collapsed: true }, DOING],
      open: [
        makeTask({ id: 1, project_id: WORK.id, title: "Write brief", section_id: TO_DO.id }),
        makeTask({ id: 2, project_id: WORK.id, title: "Review copy", section_id: DOING.id }),
      ],
    });

    renderTaskList({ project: WORK });

    expect(await screen.findByText("Review copy")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "To do" })).toHaveAttribute("aria-expanded", "false");
    expect(titlesIn("To do")).toEqual([]);
  });

  it("renames a Section from its header menu with the keyboard", async () => {
    const fetchSpy = mockApi({});
    const { user } = renderTaskList({ project: WORK });
    (await screen.findByRole("button", { name: "To do actions" })).focus();

    await user.keyboard("{Enter}");
    expect(await screen.findByRole("menuitem", { name: "Rename" })).toHaveFocus();
    await user.keyboard("{Enter}");
    const name = await screen.findByRole("textbox", { name: "Section name" });
    expect(name).toHaveValue("To do");
    expect(name).toHaveFocus();
    await user.clear(name);
    await user.keyboard("Next up{Enter}");

    expect(await screen.findByRole("region", { name: "Next up" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next up actions" })).toHaveFocus();
    await waitFor(async () => {
      expect(await writes(fetchSpy)).toEqual([
        [`PATCH /api/v1/sections/${String(TO_DO.id)}`, { name: "Next up" }],
      ]);
    });
  });

  it("leaves a Section's name alone when renaming is cancelled with Escape", async () => {
    const fetchSpy = mockApi({});
    const { user } = renderTaskList({ project: WORK });
    await user.click(await screen.findByRole("button", { name: "To do actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Rename" }));

    await user.keyboard("Other{Escape}");

    expect(screen.getByRole("region", { name: "To do" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "To do actions" })).toHaveFocus();
    expect(await writes(fetchSpy)).toEqual([]);
  });
});
