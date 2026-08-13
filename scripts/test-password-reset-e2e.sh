#!/usr/bin/env bash
# End-to-end test of the password reset flow.
# Exercises the real HTTP routes, real Postgres, real token hashing.
# Creates a throwaway user and deletes it on exit.
#
# The dev server logs the reset URL for every request (see services/email.ts),
# which is how this harness gets the raw token without reading email.
#
# Usage:
#   npm run dev > /tmp/dev.log 2>&1 &
#   ./scripts/test-password-reset-e2e.sh http://localhost:9002 /tmp/dev.log
#
# Exits non-zero if any assertion fails.

BASE="${1:?base url required}"
LOG="${2:?dev log path required}"
DB="${DATABASE_URL:-postgres://localhost:5432/civtrack_local3?sslmode=disable}"

EMAIL="reset-e2e-$$@example.com"
USERNAME="resete2e$$"
ORIG_PASS="OrigPass123"
NEW_PASS="BrandNewPass456"

# forgot-password and reset-password are rate limited 5/15min per IP. Each run
# uses a fresh forwarded IP so repeated runs test behavior, not the limiter.
# (Section 10 deliberately exercises the limiter on its own bucket.)
RUN_IP="192.0.2.$((RANDOM % 250 + 1))"
XFF=(-H "x-forwarded-for: $RUN_IP")

pass=0; fail=0
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; pass=$((pass+1)); }
bad()  { printf "  \033[31m✗\033[0m %s\n     expected: %s\n     actual:   %s\n" "$1" "$2" "$3"; fail=$((fail+1)); }
check(){ [ "$2" = "$3" ] && ok "$1" || bad "$1" "$2" "$3"; }

q() { psql "$DB" -t -A -c "$1"; }
latest_token() { grep -o "reset-password?token=[a-f0-9]*" "$LOG" | tail -1 | cut -d= -f2; }

cleanup() {
  q "DELETE FROM \"user\" WHERE email='$EMAIL';" >/dev/null 2>&1
}
trap cleanup EXIT

echo "── Setup ──────────────────────────────────────────"
reg=$(curl -s -X POST "$BASE/api/auth/register" "${XFF[@]}" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USERNAME\",\"email\":\"$EMAIL\",\"password\":\"$ORIG_PASS\"}")
grep -q '"success":true' <<<"$reg" && ok "test user registered" || bad "test user registered" "success" "$reg"
USER_ID=$(q "SELECT id FROM \"user\" WHERE email='$EMAIL';")

echo
echo "── 1. Request a reset link ────────────────────────"
r1=$(curl -s -X POST "$BASE/api/auth/forgot-password" "${XFF[@]}" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\"}")
r2=$(curl -s -X POST "$BASE/api/auth/forgot-password" "${XFF[@]}" -H 'Content-Type: application/json' -d '{"email":"definitely-no-such-user@example.com"}')
check "existing and unknown emails return identical bodies (no enumeration)" "$r1" "$r2"

bad_email=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/forgot-password" "${XFF[@]}" -H 'Content-Type: application/json' -d '{"email":"not-an-email"}')
check "malformed email rejected" "400" "$bad_email"

rows=$(q "SELECT COUNT(*) FROM password_reset_tokens WHERE user_id='$USER_ID';")
check "exactly one token row created for the real user" "1" "$rows"

unknown_rows=$(q "SELECT COUNT(*) FROM password_reset_tokens p JOIN \"user\" u ON u.id=p.user_id WHERE u.email='definitely-no-such-user@example.com';")
check "no token created for the unknown email" "0" "$unknown_rows"

TOKEN=$(latest_token)
[ -n "$TOKEN" ] && ok "raw token emitted to the reset URL" || bad "raw token emitted" "a token" "(none)"

stored=$(q "SELECT token_hash FROM password_reset_tokens WHERE user_id='$USER_ID';")
expected_hash=$(printf '%s' "$TOKEN" | shasum -a 256 | cut -d' ' -f1)
check "stored value is sha256(raw), not the raw token" "$expected_hash" "$stored"
[ "$stored" != "$TOKEN" ] && ok "raw token is never persisted" || bad "raw token never persisted" "differs" "equal"

echo
echo "── 2. Validate without consuming ──────────────────"
check "peek reports valid"        '{"valid":true}'  "$(curl -s "$BASE/api/auth/reset-password?token=$TOKEN")"
check "peek again still valid (peek must not consume)" '{"valid":true}' "$(curl -s "$BASE/api/auth/reset-password?token=$TOKEN")"
check "bogus token reports invalid" '{"valid":false}' "$(curl -s "$BASE/api/auth/reset-password?token=deadbeefdeadbeef")"
check "missing token reports invalid" '{"valid":false}' "$(curl -s "$BASE/api/auth/reset-password")"

echo
echo "── 3. Prior sessions must not survive the reset ───"
q "INSERT INTO sessions (id,user_id,session_token,expires_at,created_at)
   VALUES (gen_random_uuid(),'$USER_ID','E2E_ATTACKER_SESSION',NOW()+interval '7 days',NOW());" >/dev/null
check "planted pre-reset session exists" "1" "$(q "SELECT COUNT(*) FROM sessions WHERE session_token='E2E_ATTACKER_SESSION';")"

echo
echo "── 4. Consume the token ───────────────────────────"
resp=$(curl -s -i -X POST "$BASE/api/auth/reset-password" "${XFF[@]}" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"password\":\"$NEW_PASS\"}")
grep -q '"success":true' <<<"$resp" && ok "reset succeeded" || bad "reset succeeded" "success:true" "$(tail -1 <<<"$resp")"
grep -qi '^set-cookie: session=' <<<"$resp" && ok "fresh session cookie issued (auto-login)" || bad "session cookie issued" "set-cookie" "(none)"

check "pre-existing session was invalidated" "0" "$(q "SELECT COUNT(*) FROM sessions WHERE session_token='E2E_ATTACKER_SESSION';")"
check "token marked consumed" "1" "$(q "SELECT COUNT(*) FROM password_reset_tokens WHERE user_id='$USER_ID' AND used_at IS NOT NULL;")"

echo
echo "── 5. Token is single-use ─────────────────────────"
replay=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/reset-password" "${XFF[@]}" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"password\":\"YetAnother789\"}")
check "replaying the consumed token is rejected" "400" "$replay"
check "consumed token now peeks invalid" '{"valid":false}' "$(curl -s "$BASE/api/auth/reset-password?token=$TOKEN")"

echo
echo "── 6. The password actually changed ───────────────"
# Login is rate limited 5/5min per IP too. Use a dedicated bucket, otherwise a
# 429 here would masquerade as "the old password was rejected".
LIP="192.0.2.$((RANDOM % 250 + 1))"
new_login=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -H "x-forwarded-for: $LIP" \
  -d "{\"authString\":\"$EMAIL\",\"password\":\"$NEW_PASS\"}")
check "login with the NEW password succeeds" "200" "$new_login"

old_login=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -H "x-forwarded-for: $LIP" \
  -d "{\"authString\":\"$EMAIL\",\"password\":\"$ORIG_PASS\"}")
# Must be 401 specifically: a 429 would mean throttled, not "credentials refused".
check "login with the OLD password is refused (401, not throttled)" "401" "$old_login"

echo
echo "── 7. Re-requesting invalidates the prior link ────"
curl -s -o /dev/null -X POST "$BASE/api/auth/forgot-password" "${XFF[@]}" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\"}"
FIRST=$(latest_token)
curl -s -o /dev/null -X POST "$BASE/api/auth/forgot-password" "${XFF[@]}" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\"}"
SECOND=$(latest_token)
[ "$FIRST" != "$SECOND" ] && ok "re-request mints a different token" || bad "tokens differ" "different" "identical"
check "superseded token is dead"  '{"valid":false}' "$(curl -s "$BASE/api/auth/reset-password?token=$FIRST")"
check "current token is live"     '{"valid":true}'  "$(curl -s "$BASE/api/auth/reset-password?token=$SECOND")"
check "only one unused token remains" "1" "$(q "SELECT COUNT(*) FROM password_reset_tokens WHERE user_id='$USER_ID' AND used_at IS NULL;")"

echo
echo "── 8. Expiry is enforced ──────────────────────────"
q "UPDATE password_reset_tokens SET expires_at = NOW() - interval '1 minute' WHERE user_id='$USER_ID' AND used_at IS NULL;" >/dev/null
check "expired token peeks invalid" '{"valid":false}' "$(curl -s "$BASE/api/auth/reset-password?token=$SECOND")"
expired_post=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/reset-password" "${XFF[@]}" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$SECOND\",\"password\":\"ExpiredAttempt1\"}")
check "expired token cannot be consumed" "400" "$expired_post"

echo
echo "── 9. Input validation on reset ───────────────────"
# The reset POST limit is 5 per 15 min PER IP, and the checks above already
# spend that budget. These two use a distinct forwarded IP so they assert
# validation behavior rather than colliding with the limiter.
VIP="203.0.113.$((RANDOM % 250 + 1))"
empty_tok=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/reset-password" \
  -H 'Content-Type: application/json' -H "x-forwarded-for: $VIP" -d '{"token":"","password":"Whatever123"}')
check "empty token rejected" "400" "$empty_tok"
empty_pw=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/reset-password" \
  -H 'Content-Type: application/json' -H "x-forwarded-for: $VIP" -d "{\"token\":\"$SECOND\",\"password\":\"\"}")
check "empty password rejected" "400" "$empty_pw"

echo
echo "── 10. Rate limiting ──────────────────────────────"
# Fresh bucket: the 6th request from one IP must be refused.
RIP="198.51.100.$((RANDOM % 250 + 1))"
for _ in 1 2 3 4 5; do
  curl -s -o /dev/null -X POST "$BASE/api/auth/forgot-password" \
    -H 'Content-Type: application/json' -H "x-forwarded-for: $RIP" -d "{\"email\":\"$EMAIL\"}"
done
sixth=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/forgot-password" \
  -H 'Content-Type: application/json' -H "x-forwarded-for: $RIP" -d "{\"email\":\"$EMAIL\"}")
check "6th forgot-password request from one IP is rate limited" "429" "$sixth"

echo
echo "═══════════════════════════════════════════════════"
printf "  %d passed, %d failed\n" "$pass" "$fail"
echo "═══════════════════════════════════════════════════"
[ "$fail" -eq 0 ]
