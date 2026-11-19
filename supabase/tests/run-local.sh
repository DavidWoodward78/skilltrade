#!/usr/bin/env bash
# Runs the Slack database tests against your LOCAL Supabase (`supabase start`).
# The test runs in a transaction and is rolled back, but this script still refuses non-local databases.
set -euo pipefail
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing to run tests against a non-local database: $DB_URL" >&2; exit 1 ;;
esac
cd "$(dirname "$0")/../.."
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/slack.sql
