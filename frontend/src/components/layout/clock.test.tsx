import { act, render, screen } from "@testing-library/react";

import { Clock } from "./clock";

describe("Clock", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 15, 14, 5, 30) });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ticks over at the next minute", () => {
    render(<Clock />);
    expect(screen.getByText(/Thursday/)).toHaveTextContent(/:05/);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText(/Thursday/)).toHaveTextContent(/:06/);
  });
});
