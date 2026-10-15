import { act, render, screen } from "@testing-library/react";

import { CurrentDate } from "./current-date";

describe("CurrentDate", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 15, 23, 59, 30) });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the date without the time", () => {
    render(<CurrentDate />);
    expect(screen.getByText(/Thursday/)).not.toHaveTextContent(/\d:\d\d/);
  });

  it("rolls over at midnight", () => {
    render(<CurrentDate />);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText(/Friday/)).toBeInTheDocument();
  });
});
