import { InfraiError, infrai } from "./infrai-rest.js";
import { decideSnapshot, nightlySnapshotRequest } from "./tenant-snapshot.js";

const bucket = process.env.SNAPSHOT_BUCKET ?? "saas-nightly-snapshots";

async function ensureSnapshotBucket(): Promise<void> {
  try {
    await infrai.storage.bucket.get(bucket);
  } catch (error) {
    if (!(error instanceof InfraiError) || error.status !== 404) throw error;
    await infrai.storage.bucket.create(bucket);
  }
}

async function main(): Promise<void> {
  const raw = process.env.SNAPSHOT_REQUEST;
  if (!raw) throw new Error("Set SNAPSHOT_REQUEST to the admin snapshot JSON.");
  const request = nightlySnapshotRequest.parse(JSON.parse(raw));
  const snapshot = decideSnapshot(request);
  if (!snapshot) {
    console.log(JSON.stringify({ scheduled: false, reason: "account lifecycle has no nightly snapshot" }));
    return;
  }

  await ensureSnapshotBucket();
  const bytes = new TextEncoder().encode(snapshot.payload);
  const signed = await infrai.storage.object.presign(bucket, snapshot.key, {
    op: "put",
    expires_seconds: 900,
    content_type: "application/json",
    max_bytes: bytes.byteLength,
    idempotency_key: `${request.tenantId}:${request.capturedAt}`,
  });
  const upload = await fetch(signed.url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: bytes,
  });
  if (!upload.ok) throw new Error("Snapshot upload did not complete.");

  const verification = await infrai.storage.object.head(bucket, snapshot.key);
  if (!verification.found) throw new Error("Snapshot verification did not find the uploaded object.");
  const listed = await infrai.storage.object.list(bucket);
  console.log(JSON.stringify({ scheduled: true, bucket, key: snapshot.key, objectCount: listed.items.length }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
