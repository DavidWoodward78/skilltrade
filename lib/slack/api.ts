/** Minimal Slack Web API client: JSON POSTs, 429 handling with Retry-After, retries on 5xx. */

export class SlackApiError extends Error {
  method: string;
  code: string;
  /** Seconds Slack asked us to wait (rate limits). */
  retryAfter?: number;
  constructor(method: string, code: string, retryAfter?: number) {
    super(`Slack ${method} failed: ${code}`);
    this.method = method;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

/** The workspace token no longer works: stop using this link. */
export const AUTH_ERRORS = new Set(["invalid_auth", "token_revoked", "account_inactive", "not_authed", "token_expired"]);
/** Retrying won't help (wrong user, user gone, etc.). */
export const PERMANENT_ERRORS = new Set([
  "missing_scope", "users_not_found", "user_not_found", "user_disabled", "channel_not_found", "cannot_dm_bot", "not_allowed_token_type",
  "invalid_arguments", "invalid_blocks", "msg_too_long", "no_text", "message_not_found", "cant_update_message", "is_archived",
]);

export type SlackFetch = (url: string, init: RequestInit) => Promise<Response>;

export type CallOptions = {
  fetch?: SlackFetch;
  sleep?: (ms: number) => Promise<void>;
  /** Wait-and-retry in place for short Retry-After values; longer waits are thrown back to the outbox. */
  maxInlineWaitSeconds?: number;
  maxAttempts?: number;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SlackResult = Record<string, any> & { ok: boolean };

export async function callSlack(method: string, token: string, body: Record<string, unknown>, opts: CallOptions = {}): Promise<SlackResult> {
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const maxWait = opts.maxInlineWaitSeconds ?? 5;
  const maxAttempts = opts.maxAttempts ?? 3;

  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await doFetch(`https://slack.com/api/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8", authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
    } catch {
      if (attempt >= maxAttempts) throw new SlackApiError(method, "network_error");
      await sleep(500 * 2 ** (attempt - 1));
      continue;
    }

    if (res.status === 429) {
      const retryAfter = Math.max(1, Number(res.headers.get("retry-after")) || 1);
      if (attempt < maxAttempts && retryAfter <= maxWait) {
        await sleep(retryAfter * 1000);
        continue;
      }
      throw new SlackApiError(method, "ratelimited", retryAfter);
    }
    if (res.status >= 500) {
      if (attempt >= maxAttempts) throw new SlackApiError(method, `http_${res.status}`);
      await sleep(500 * 2 ** (attempt - 1));
      continue;
    }

    const json = (await res.json().catch(() => ({ ok: false, error: "bad_json" }))) as SlackResult;
    if (!json.ok) throw new SlackApiError(method, String(json.error ?? "unknown_error"));
    return json;
  }
}

/** OAuth v2 code exchange (client credentials, no bot token yet). */
export async function exchangeOAuthCode(input: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  fetch?: SlackFetch;
}): Promise<SlackResult> {
  const doFetch = input.fetch ?? fetch;
  const res = await doFetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: "Basic " + Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64"),
    },
    body: new URLSearchParams({ code: input.code, redirect_uri: input.redirectUri }).toString(),
  });
  const json = (await res.json().catch(() => ({ ok: false, error: "bad_json" }))) as SlackResult;
  if (!json.ok) throw new SlackApiError("oauth.v2.access", String(json.error ?? "unknown_error"));
  return json;
}
