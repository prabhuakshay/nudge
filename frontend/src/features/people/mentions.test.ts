import { fromEditable, plainMentions, splitMentions } from "./mentions";

const PRIYA = { id: 1, name: "Priya" };
const PRIYA_SHAH = { id: 2, name: "Priya Shah" };
const OKAFOR = { id: 3, name: "Dr. Okafor" };

describe("splitMentions", () => {
  it("splits text into plain parts and Mentions", () => {
    expect(splitMentions("Ask [@Priya](person:1) and [@Sam](person:22)!")).toEqual([
      "Ask ",
      { id: 1, name: "Priya" },
      " and ",
      { id: 22, name: "Sam" },
      "!",
    ]);
  });

  it("leaves text without Mentions whole", () => {
    expect(splitMentions("Email @Priya")).toEqual(["Email @Priya"]);
  });
});

describe("plainMentions", () => {
  it("writes each Mention as @Name", () => {
    expect(plainMentions("Waiting on [@Priya Shah](person:2) since May")).toBe(
      "Waiting on @Priya Shah since May",
    );
  });
});

describe("fromEditable", () => {
  it("turns @Name of a known Person back into a Mention, ignoring case", () => {
    expect(fromEditable("Call @priya, then @Nobody", [PRIYA])).toBe(
      "Call [@Priya](person:1), then @Nobody",
    );
  });

  it("prefers the longest name, and names with spaces and dots", () => {
    expect(
      fromEditable("@Priya Shah and @Priya meet @Dr. Okafor", [PRIYA, PRIYA_SHAH, OKAFOR]),
    ).toBe("[@Priya Shah](person:2) and [@Priya](person:1) meet [@Dr. Okafor](person:3)");
  });

  it("only matches a whole name", () => {
    expect(fromEditable("@Priyanka and mail@priya.dev", [PRIYA])).toBe(
      "@Priyanka and mail@priya.dev",
    );
  });

  it("round-trips text with Mentions", () => {
    const text = "Ask [@Priya](person:1) about [@Priya Shah](person:2)";
    expect(fromEditable(plainMentions(text), [PRIYA, PRIYA_SHAH])).toBe(text);
  });
});
