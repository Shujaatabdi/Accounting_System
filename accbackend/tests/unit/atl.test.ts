import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { atlRecordingApplies, atlSnapshotView, parseAtlInput } from "../../src/shared/atl";

describe("manual ATL", () => {
  it("applies only when the company and the party tax country are both Pakistan", () => {
    assert.equal(atlRecordingApplies("PK", "PK"), true);
    assert.equal(atlRecordingApplies(" PK ", "pk"), true);
    assert.equal(atlRecordingApplies("PK", "CA"), false);
    assert.equal(atlRecordingApplies("AE", "PK"), false);
    assert.equal(atlRecordingApplies(null, "PK"), false);
  });

  it("keeps a missing snapshot distinct from a posted unknown record", () => {
    assert.equal(atlSnapshotView(false, null, null, null), null);
    assert.deepEqual(atlSnapshotView(true, null, null, null), {
      recorded: false,
      status: null,
      checkedAt: null,
      reference: null,
    });
    assert.equal(atlSnapshotView(true, "active", "2026-10-03T08:00:00.000Z", "ATL-1")?.recorded, true);
  });

  it("requires a check time and a reference when a status is entered", () => {
    assert.deepEqual(parseAtlInput({ status: null }), { status: null, checkedAt: null, reference: null });
    assert.throws(() => parseAtlInput({ status: "inactive", checkedAt: "", reference: "note" }), /date and time/);
    const saved = parseAtlInput({ status: "active", checkedAt: "2026-10-03T08:00:00.000Z", reference: " portal slip " });
    assert.equal(saved.status, "active");
    assert.equal(saved.reference, "portal slip");
  });
});
