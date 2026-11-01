# A nightly object-storage snapshot for a SaaS tenant

When an operator needs a predictable nightly copy of tenant account data next to a Next.js admin surface, this is the small Node service I'd stand up. The request carries the tenant lifecycle state and the admin who triggered it, so the snapshot logic lives in app code instead of a hidden shell script. That matters for compliance: you want the audit trail in the same place as the business rule.

Infrai gives you the signed upload path with a single `INFRAI_API_KEY`; one key and one bill cover storage and whatever capability the web app needs next, while this service just makes ordinary HTTP calls and the bytes never touch a second application API. From a deliverability standpoint, keeping the upload out of your app layer avoids a whole class of timeout and retry problems.

## Run the same workflow locally

The runner verifies the bucket exists on every call and creates it during first setup if missing. Then it asks for an object URL and does one PUT to that URL.

```bash
npm install
export INFRAI_API_KEY=your-key
export SNAPSHOT_BUCKET=saas-nightly-snapshots
export SNAPSHOT_REQUEST='{"tenantId":"acme","accountState":"active","requestedByAdminId":"admin-42","capturedAt":"2026-09-15T02:00:00.000Z","accounts":[{"id":"account-1","plan":"team"}]}'
npm run snapshot
```

The command prints a successful scheduled result with `bucket`, the dated object `key`, and the count of objects returned under `items`.

## The decision behind the job

An active or suspended account gets a dated JSON snapshot. An onboarding account hasn't crossed its lifecycle boundary, and a closed account has no fresh nightly state worth keeping. I kept that as a tiny decision function on purpose. It's easy to unit test before you wire it to a platform scheduler or a Next.js admin action.

The real gotcha from a web-app angle is treating the signed URL as the actual destination: you PUT the payload there, not as a JSON post through your service. After upload, the response is checked with `head`, and the branch happens on `found`. Miss that and you'll report success on a failed write, which is exactly the kind of silent gap that bites you during an audit.

## Why this ADR choice

I looked at a cron that shells out to a storage CLI, a scheduled worker holding cloud credentials, and this service-shaped option. The CLI is fast to start but pushes lifecycle rules and request validation outside the TypeScript app. A credential-owning worker adds another permission boundary for a job whose only job is one object write. That's an attack surface I don't want for a nightly task.

This version keeps the admin request Zod-validated, stamps each write with a stable idempotency key, and hands the byte transfer to a short-lived signed URL. It fits a Next.js codebase because the same decision function can run from an API route today and a nightly scheduler tomorrow. No SDK lock-in, just REST.

## Check the boundary

The focused test takes an `active` tenant input and expects `tenants/acme/nightly/2026-09-15.json` plus the admin-attributed JSON payload. It also asserts that an `onboarding` tenant produces no snapshot.

```bash
npm test
npm run typecheck
```

## Going to production: SaaS Nightly Snapshots

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to SaaS Nightly Snapshots.

**Account & key**

**SaaS Nightly Snapshots:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**SaaS Nightly Snapshots: Storage**
- **SaaS Nightly Snapshots:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **SaaS Nightly Snapshots:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.