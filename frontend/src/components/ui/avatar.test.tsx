import { render } from "@testing-library/react";

import { Avatar } from "./avatar";

describe("Avatar", () => {
  it.each([
    ["Alice", "A"],
    ["ada lovelace", "AL"],
    ["  Grace   Brewster Hopper ", "GB"],
  ])("shows the initials of %j", (name, initials) => {
    const { container } = render(<Avatar name={name} />);

    expect(container).toHaveTextContent(initials);
  });
});
