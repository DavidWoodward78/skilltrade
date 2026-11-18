# SkillTrade (name pending)

A private skill-trade network for founder communities. Organizations invite members; members list what they offer and need, match, agree a Trade Card, deliver in milestones, confirm, and build a reputation based on finished work. Admins see outcomes and skill gaps.

Stack: Next.js 15 (App Router, server actions) · Supabase (Postgres, Auth, Realtime) · Tailwind CSS 4. Mobile-first web.

## What's in the MVP

**Members**
- Sign in with LinkedIn, GitHub, or an emailed magic link
- Verified badges: LinkedIn and GitHub connections are recorded by the database (users can't set them), shown on cards, profiles and portfolios; existing members can connect accounts from their profile
- Join a community by invite link or code
- Profile: photo (cropped and resized in the browser, stored in Supabase Storage), name, headline, portfolio link, availability, bio
- Onboarding checklist on Discover until photo, skills and headline are set
- Up to 5 skills offered (with level) and 5 needed, from shared categories
- Discover: search by skill or name, ranked by mutual fit
- Optional swipe mode: full-size photo cards for people with a fit
- "I'm interested" → reciprocal interest creates a match
- Real-time chat per match
- Trade Cards: what each side delivers, hours, due date, definition of done; partner accepts or declines
- Milestones with proof of delivery (link or note), confirmed by the other side
- Both sides confirm delivery → trade completes
- Reviews (1–5 stars + one line) after a trade closes
- Reputation that travels across communities: completed trades, completion rate, on-time rate, rating, cancellations
- New members limited to one open trade until their first completion
- Public portfolio (opt-in) at `/p/<username>`: photo, track record, completed trades with proof links and partner reviews, marked verified; shareable with link previews. Partners appear by name only if their own portfolio is public; any trade can be hidden.
- Cancel with a required reason, private reports to admins, block
- Fault-based reputation: an unfinished trade only counts against the side whose delivery was never confirmed; cancellations count against whoever cancelled after accepting
- Reputation shows unique partners, so repeated trades with one person don't inflate a record
- Warnings before trading with someone who has no completed trades or a history of not delivering
- Auto-pause: a member reported by 2+ different people can't start matches or trades until an admin reinstates them (admins are never auto-paused)

**Admins**
- Invite link with rotation
- Outcome tiles: members, % who completed a trade, completion rate, repeat traders
- Trade funnel: profiles → matches → proposed → accepted → completed
- Skill-gap report: needed vs offered by category
- Open reports with resolve
- "Needs a look" flags: pairs who only trade with each other, trades accepted and completed within an hour, reported and paused members (with Reinstate)
- Pause or reinstate a member by hand
- Member list: promote, demote, remove (a community always keeps one admin)

**Platform**
- Multi-tenant: matches, trades and messages belong to one organization
- Row Level Security on every table; trade state changes go through database functions, so the rules hold even if someone calls the API directly
- `expire_stale_trades()` marks trades unconfirmed 14 days past due as incomplete

Not included yet: email notifications, payments or org billing, credits, native apps, admin-configurable categories, file uploads for proof.

## Setup

1. **Create a Supabase project** at supabase.com.
2. **Run the migration:** in the Supabase dashboard, open SQL Editor, paste `supabase/migrations/20261117000000_init.sql`, and run it. Or with the CLI: `supabase link` then `supabase db push`.
3. **Auth settings** (Authentication → URL Configuration):
   - Site URL: your app URL (e.g. `http://localhost:3000` locally)
   - Redirect URLs: add `http://localhost:3000/auth/callback` and your production `https://YOUR-DOMAIN/auth/callback`
4. **Environment:** copy `.env.example` to `.env.local` and fill in your project URL and publishable (anon) key from Project Settings → API.
5. **Run it:**
   ```bash
   npm install
   npm run dev
   ```
6. Sign in, create a community, copy the invite link from Admin, and open it in another browser (or incognito) with a second email to test matching.

### LinkedIn and GitHub sign-in

Supabase callback URL for both providers: `https://<project-ref>.supabase.co/auth/v1/callback`

**GitHub:** github.com → Settings → Developer settings → OAuth Apps → New OAuth App. Homepage = your site URL; Authorization callback URL = the Supabase callback above. Copy the Client ID, generate a Client secret, then in Supabase: Authentication → Sign In / Providers → GitHub → enable and paste both.

**LinkedIn:** linkedin.com/developers → Create app (needs a LinkedIn Page for your company). Products tab → request "Sign In with LinkedIn using OpenID Connect". Auth tab → add the Supabase callback under Authorized redirect URLs; copy Client ID and Primary Client Secret. In Supabase: Authentication → Sign In / Providers → LinkedIn (OIDC) → enable and paste both.

**Connecting accounts to an existing login:** Supabase → Authentication → Sign In / Providers (or Settings) → enable "Allow manual linking".

### Nightly cleanup

Already scheduled by migration `20261118000300_schedule_expire.sql`. To set it up by hand instead:

#### Manual

Enable the `pg_cron` extension in Supabase, then run once in SQL Editor:

```sql
select cron.schedule('expire-stale-trades', '0 7 * * *', $$select public.expire_stale_trades()$$);
```

### Deploy to Vercel

Production domain: **https://skilltrade.team**. Set `NEXT_PUBLIC_SITE_URL=https://skilltrade.team` in Vercel; the production `*.vercel.app` address then redirects there automatically (preview deployments don't).


Import the repo, add the three env vars (set `NEXT_PUBLIC_SITE_URL` to your production URL), deploy, then add the production callback URL in Supabase Auth.

## Project layout

```
app/
  page.tsx                  landing
  login/                    magic-link sign-in
  auth/callback, signout    auth routes
  orgs/                     your communities, create, join
  join/[code]/              invite link handler
  o/[slug]/                 community area (bottom nav)
    page.tsx                Discover (search, list, swipe)
    profile/                your profile, skills, reputation
    people/[id]/            member profile, interest, report, block
    matches/                matches list, chat + Trade Card proposal
    trades/                 your trades, Trade Card detail, milestones, reviews
    admin/                  outcomes, funnel, skill gaps, reports, members
    actions.ts              all server actions
components/                 UI pieces
lib/                        Supabase clients, constants, org context
supabase/migrations/        schema, RLS and functions
supabase/tests/             SQL scenario test
```

## Renaming

Change `APP_NAME` in `lib/constants.ts`.

## Testing the database rules

`supabase/tests/scenario.sql` walks through join → match → chat → trade → milestone → complete → review → admin stats, and checks the guards (one open trade for new members, only the partner can accept, only the other side confirms, admin-only stats, last-admin protection, blocks hide people). Run it against a local Supabase (`supabase start`) after creating three users.
