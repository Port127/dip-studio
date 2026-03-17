import { describe, expect, it } from "vitest";

import { asMessage, readOptionalString } from "./env";

describe("env helpers", () => {
  it("converts non-Error values to strings", () => {
    expect(asMessage("boom")).toBe("boom");
    expect(asMessage(503)).toBe("503");
  });

  it("returns undefined for missing optional strings", () => {
    expect(readOptionalString(undefined)).toBeUndefined();
  });
});
