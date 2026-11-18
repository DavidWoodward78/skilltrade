-- Run the stale-trade check every day at 07:00 UTC (2am ET).
create extension if not exists pg_cron;
select cron.schedule('expire-stale-trades', '0 7 * * *', $$select public.expire_stale_trades()$$);
