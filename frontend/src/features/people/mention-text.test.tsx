import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";

import { INBOX } from "@/test/drawer";

import { MentionText } from "./mention-text";
import { peopleQuery } from "./people";

function renderText(text: string) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(peopleQuery.queryKey, {
    inbox: INBOX,
    items: [],
    archived: [],
    tags: [],
    people: [{ id: 1, name: "Priya Shah", color: "violet" }],
    today_count: 0,
    upcoming_count: 0,
  });
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <p>
        <MentionText text={text} />
      </p>
    </QueryClientProvider>,
  );
  return container;
}

describe("MentionText", () => {
  it("shows each Mention as a chip in the Person's colour, under their current name", () => {
    const container = renderText("Ask [@Priya](person:1) about it");

    const chip = screen.getByText("Priya Shah");
    expect(chip.closest("[data-mention]")).toHaveClass("text-hue-violet");
    expect(container).toHaveTextContent("Ask PSPriya Shah about it");
  });

  it("keeps the written name of a Person it doesn't know", () => {
    renderText("Ask [@Sam](person:9)");

    expect(screen.getByText("Sam")).toBeInTheDocument();
  });
});
