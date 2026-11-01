import { z } from "zod";

export const nightlySnapshotRequest = z.object({
  tenantId: z.string().min(1),
  accountState: z.enum(["onboarding", "active", "suspended", "closed"]),
  requestedByAdminId: z.string().min(1),
  capturedAt: z.string().datetime(),
  accounts: z.array(z.object({ id: z.string().min(1), plan: z.string().min(1) })).min(1),
});

export type NightlySnapshotRequest = z.infer<typeof nightlySnapshotRequest>;

export function decideSnapshot(request: NightlySnapshotRequest): { key: string; payload: string } | null {
  if (request.accountState === "onboarding" || request.accountState === "closed") return null;
  const day = request.capturedAt.slice(0, 10);
  const key = `tenants/${request.tenantId}/nightly/${day}.json`;
  return {
    key,
    payload: JSON.stringify({
      tenantId: request.tenantId,
      accountState: request.accountState,
      requestedByAdminId: request.requestedByAdminId,
      capturedAt: request.capturedAt,
      accounts: request.accounts,
    }),
  };
}
