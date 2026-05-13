import { describe, expect, it } from "vitest";
import { parseDesktopToolBlocks, userExplicitlyRequestedComputerUse } from "./desktopTools";

describe("desktopTools", () => {
  it("extracts safe tool blocks and removes them from visible text", () => {
    const parsed = parseDesktopToolBlocks(
      'I can open that for you. <CLICKY_TOOL>{"name":"open_url","args":{"url":"https://example.com/docs"}}</CLICKY_TOOL>'
    );

    expect(parsed.cleanText).toBe("I can open that for you.");
    expect(parsed.toolCalls).toEqual([{ name: "open_url", args: { url: "https://example.com/docs" } }]);
  });

  it("drops unsupported computer-control tools", () => {
    const parsed = parseDesktopToolBlocks('No. <CLICKY_TOOL>{"name":"click_at","args":{"x":1,"y":2}}</CLICKY_TOOL>');

    expect(parsed.cleanText).toBe("No.");
    expect(parsed.toolCalls).toEqual([]);
  });

  it("requires explicit computer-use language", () => {
    expect(userExplicitlyRequestedComputerUse("open the documentation")).toBe(true);
    expect(userExplicitlyRequestedComputerUse("what is the weather")).toBe(false);
  });
});
