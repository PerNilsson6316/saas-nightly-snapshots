import assert from "node:assert/strict";
import test from "node:test";
import { decideSnapshot } from "./tenant-snapshot.js";

test("an active tenant produces an admin-attributed nightly object key", () => {
  const result = decideSnapshot({
    tenantId: "acme",
    accountState: "active",
    requestedByAdminId: "admin-42",
    capturedAt: "2026-09-15T02:00:00.000Z",
    accounts: [{ id: "account-1", plan: "team" }],
  });
  assert.deepEqual(result && JSON.parse(result.payload), {
    tenantId: "acme",
    accountState: "active",
    requestedByAdminId: "admin-42",
    capturedAt: "2026-09-15T02:00:00.000Z",
    accounts: [{ id: "account-1", plan: "team" }],
  });
  assert.equal(result?.key, "tenants/acme/nightly/2026-09-15.json");
});

test("an onboarding tenant is skipped until its lifecycle is active", () => {
  assert.equal(decideSnapshot({
    tenantId: "newco",
    accountState: "onboarding",
    requestedByAdminId: "admin-42",
    capturedAt: "2026-09-15T02:00:00.000Z",
    accounts: [{ id: "account-1", plan: "trial" }],
  }), null);
});
