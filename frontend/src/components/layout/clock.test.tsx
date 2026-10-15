import { act, render, screen } from "@testing-library/react";

import { Clock } from "./clock";

describe("Clock", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 15, 14, 5, 58, 500) });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the date and ticks every second", () => {
    render(<Clock />);
    const clock = screen.getByText(/Thu/);
    expect(clock).toHaveTextContent(/05:58/);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(clock).toHaveTextContent(/05:59/);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(clock).toHaveTextContent(/06:00/);
  });
});
