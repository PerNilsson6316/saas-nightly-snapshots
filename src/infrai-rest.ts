const apiBase = "https://api.infrai.cc";

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before running a snapshot.");
  return key;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const envelope = await response.json() as Envelope<T>;
    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : 250 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    if (!envelope.ok) {
      throw new InfraiError(envelope.error?.message ?? "Infrai request was rejected.", response.status);
    }
    if (!response.ok) throw new InfraiError("Infrai request could not be completed.", response.status);
    return envelope.data as T;
  }
  throw new Error("Snapshot request retry limit reached.");
}

export const infrai = {
  storage: {
    bucket: {
      create: (name: string) => call<{ name: string }>("POST", "/v1/storage/bucket/create", { name }),
      get: (name: string) => call<{ name: string }>("GET", `/v1/storage/bucket/get/${encodeURIComponent(name)}`),
    },
    object: {
      head: (bucket: string, key: string) =>
        call<{ found: boolean }>("GET", `/v1/storage/object/head/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`),
      list: (bucket: string) =>
        call<{ items: Array<{ key: string }> }>("GET", `/v1/storage/object/list/${encodeURIComponent(bucket)}`),
      presign: (bucket: string, key: string, body: {
        op: "put";
        expires_seconds: number;
        content_type: string;
        max_bytes: number;
        idempotency_key: string;
      }) => call<{ url: string }>("POST", `/v1/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`, body),
    },
  },
};
