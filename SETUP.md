# Slack integration setup

Members get SkillTrade value without leaving Slack. SkillTrade stays the system of record for profiles, trades, terms and reputation; Slack carries the notifications and conversations.

**What Phase 1 does**

- **Add to Slack**: a community admin connects one Slack workspace (one workspace per community, one community per workspace).
- **Interest DMs**: when someone taps *I'm interested* on a member, the bot DMs that member a card showing who it is, what they offer and need, with **[Interested]** and **[Pass]** buttons.
  - **Interested** creates the match (the same reciprocal-interest rule as the web), updates the card, and opens a group DM with both people plus a link to agree trade terms.
  - **Pass** updates only that member's card, and the other person is never told.
- **Web matches**: a match made entirely on the web also gets the group DM intro.
- **Sign in with Slack**: people can sign in or join with Slack. If their workspace is linked to a community, they join it (or land as *pending* when admin approval is on). Accounts are linked by verified email, so no duplicates are created.
- **Finding members**: members are found in Slack by their Slack sign-in, or else by their email address in the linked workspace.
- **Disconnecting**: uninstalling the app, revoking its token, or clicking *Disconnect Slack* on the admin page turns the link off.

**Plans:**
- Slack is included on **Growth**, **Enterprise**, **Pilot** and the **free trial**, but not on **Community**.
- On a plan without Slack, the admin page shows an upgrade prompt instead of Add to Slack.
- A community that downgrades keeps its link, but Slack pauses until it upgrades.
- To change which plans include Slack, edit `lib/slack/plans.ts`, `slack_plan_includes()` in the migration, and `PLANS[...].slack` in `lib/plans.ts`. `npm test` checks that all three match.

**Help page for community admins:** `/help/slack` (public), linked from the admin page's Slack section.

## 1. Create the Slack app from the manifest

1. Open `slack/manifest.yml` and replace:
   - `https://skilltrade.team` with your app URL (use a tunnel URL for local testing, see step 5)
   - `YOUR-PROJECT-REF` with your Supabase project ref (Supabase → Project Settings → General)
2. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From an app manifest**, pick a workspace, paste the YAML and create the app.
3. **Manage Distribution** → work through the checklist → **Activate Public Distribution**. Without this, the app can only be installed in the workspace you created it in, and each community needs its own workspace install.
4. **Basic Information** → **App Credentials**: copy the Client ID, Client Secret and Signing Secret.

Scopes, and why each is needed:

| Scope | Why |
|---|---|
| `chat:write` | Post the interest card and intro; update the card after a click |
| `im:write` | Open a 1:1 DM with a member |
| `mpim:write` | Open the group DM with both matched members |
| `users:read` | Required alongside `users:read.email` |
| `users:read.email` | Find members who didn't sign in with Slack, by email, in the linked workspace only |
| `openid`, `email`, `profile` (user scopes) | Sign in with Slack |

## 2. Environment variables

Add these to `.env.local` locally and to Vercel (Project → Settings → Environment Variables):

```bash
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
SLACK_SIGNING_SECRET=...
SLACK_TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)   # keep it stable; changing it orphans stored tokens
CRON_SECRET=$(openssl rand -hex 32)
SUPABASE_SERVICE_ROLE_KEY=...                           # already used by billing
```

Bot tokens are encrypted with AES-256-GCM before they're stored. The admin page shows **Add to Slack** only when all of these are set.

## 3. Database

Apply `supabase/migrations/20261119000000_slack.sql`, either with `supabase db push` or by pasting it into the SQL Editor.

## 4. Sign in with Slack (Supabase Auth)

Supabase → **Authentication** → **Sign In / Providers** → **Slack (OIDC)**: enable it and paste the same Client ID and Client Secret. The Supabase callback URL is already in the manifest.

Sign-in links to an existing account by verified email. Supabase does this automatically when both emails are verified, which is true of magic-link, LinkedIn and GitHub accounts.

## 5. Retry sweep (recommended)

Notifications go out immediately: after someone taps Interested, and after a Slack button click. Anything that hit a rate limit or a Slack hiccup waits in `slack_outbox` until the sweep retries it.

Run the sweep every 5 minutes with Supabase's `pg_cron` and `pg_net`. Enable both extensions, then run this once in the SQL Editor:

```sql
select vault.create_secret('<your CRON_SECRET>', 'slack_cron_secret');
select cron.schedule('slack-outbox-retry', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://skilltrade.team/api/slack/outbox',
    headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'slack_cron_secret')),
    body := '{}'::jsonb);
$$);
```

Any other scheduler works too: send `GET` or `POST /api/slack/outbox` with `Authorization: Bearer $CRON_SECRET`. Vercel Cron also works, but its Hobby plan only allows daily jobs.

## 6. Test in a dev workspace

Slack needs public HTTPS URLs, so expose your local server:

```bash
npm run dev
npx cloudflared tunnel --url http://localhost:3000   # or: ngrok http 3000
```

1. Set `NEXT_PUBLIC_SITE_URL` to the tunnel URL, restart `npm run dev`, and update the three `skilltrade.team` URLs in your Slack app:
   - **OAuth & Permissions** → Redirect URLs
   - **Event Subscriptions** → Request URL (Slack sends a challenge, which the app answers)
   - **Interactivity** → Request URL

   Also add `<tunnel>/auth/callback` to Supabase → Authentication → URL Configuration → Redirect URLs.
2. Create a free Slack workspace for testing and invite a second account (or use a second browser).
3. In SkillTrade, open your community → **Admin** → **Slack** → **Add to Slack** → allow. The admin page shows the workspace as connected.
4. With two members whose SkillTrade emails match their Slack emails (or who signed in with Slack): member A taps **I'm interested** on member B.
   - B gets a DM card from the SkillTrade bot.
   - **Interested**: the card updates, and a group DM opens with both people and an **Agree trade terms** button.
   - **Pass** (on another pair): only B's card changes; A sees nothing.
5. Sign in with Slack in a fresh browser using a workspace member who isn't in SkillTrade yet. They land as **pending** (approval on) or go straight in (approval off).
6. Uninstall the app from the workspace (or click **Disconnect Slack**). The admin page shows it as disconnected, and no more DMs are sent.

Troubleshooting: rows in `slack_outbox` show what was sent, skipped (with a `result.reason` such as `no_slack_user`) or failed (`last_error`).

## Tests

```bash
npm test          # signature verification, accept/accept, accept/pass, isolation, retries (Node's built-in runner)
supabase start && supabase db reset
npm run test:db   # database rules: flows, idempotency, community isolation (runs in a rolled-back transaction)
```

## Phase 2 (stubbed, not built)

These are planned out in `lib/slack/phase2/`. `/api/slack/commands` exists but isn't registered in the manifest.

- **Weekly digest** to an admin-chosen channel: new members, trades completed, top contributors.
- **Due-date nudges** by DM: "Your trade with X is due Friday. Mark it done?"
- **`/skilltrade` slash command** for posting a need or an offer.
