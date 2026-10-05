import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectVisibleProfile } from "../../src/modules/company/tax.service";

const row = (effectiveFrom: string, isActive = true, effectiveTo: string | null = null) => ({
  id: effectiveFrom,
  isActive,
  effectiveFrom,
  effectiveTo,
});

describe("accounting profile selection", () => {
  it("uses the profile that covers the company date", () => {
    const selected = selectVisibleProfile([row("2026-10-04"), row("2026-10-01")], "2026-10-03");
    assert.equal(selected?.effectiveFrom, "2026-10-01");
  });

  it("shows the next active profile when none covers the company date", () => {
    const selected = selectVisibleProfile([row("2026-10-04")], "2026-10-03");
    assert.equal(selected?.effectiveFrom, "2026-10-04");
  });

  it("returns nothing when no profile is stored", () => {
    assert.equal(selectVisibleProfile([], "2026-10-03"), null);
  });
});
