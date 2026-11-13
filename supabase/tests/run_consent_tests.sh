#!/usr/bin/env bash
# Runs the consent migration against a throwaway local Postgres (needs postgresql-16 binaries; run as a user that can start it).
# Usage: supabase/tests/run_consent_tests.sh [psql args, e.g. -h /tmp/pgtest -p 5544 -U postgres]
set -euo pipefail
cd "$(dirname "$0")/../.."
P="${@:--h /tmp/pgtest -p 5544 -U postgres}"
DB=consent_test_$$
psql $P -qc "create database $DB" postgres
trap 'psql $P -qc "drop database $DB" postgres >/dev/null 2>&1 || true' EXIT
node tools/build-legal.js >/dev/null
node supabase/tests/make_vars.js > /tmp/consent_vars.sql
psql $P -q -v ON_ERROR_STOP=1 -d $DB -f supabase/tests/stub_schema.sql
psql $P -q -v ON_ERROR_STOP=1 -d $DB -f supabase/migrations/20261117_consent_logging.sql
psql $P -q -v ON_ERROR_STOP=1 -d $DB -f supabase/migrations/20261118_legal_doc_versions.sql
psql $P -q -v ON_ERROR_STOP=1 -d $DB -f /tmp/consent_vars.sql -f supabase/tests/consent_logging_test.sql
# Enforcement runs on a fresh database (the main tests publish a fake newer document version).
DB2=${DB}_enforce
psql $P -qc "create database $DB2" postgres
trap 'psql $P -qc "drop database $DB" postgres >/dev/null 2>&1 || true; psql $P -qc "drop database $DB2" postgres >/dev/null 2>&1 || true' EXIT
for f in supabase/tests/stub_schema.sql supabase/migrations/20261117_consent_logging.sql supabase/migrations/20261118_legal_doc_versions.sql supabase/migrations/20261119_require_consent.sql; do
  psql $P -q -v ON_ERROR_STOP=1 -d $DB2 -f $f 2>&1 | grep -v "does not exist, skipping" || true
done
psql $P -q -v ON_ERROR_STOP=1 -d $DB2 -f /tmp/consent_vars.sql -f supabase/tests/enforce_test.sql
