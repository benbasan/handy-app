#!/usr/bin/env bash
#
# run-all-phases.sh — builds Phase 2..9 of docs/roadmap.md unattended.
#
# One Claude Code process per phase, so every phase starts from a genuinely
# clean session: no conversation history, memory comes only from CLAUDE.md,
# docs/, design/ and the current state of the repo.
#
# The important part is what happens AFTER the agent says it is done: this
# script runs its own quality gate (lint, typecheck, build, db:reset, db:test,
# clean tree, no leaked secrets, RTL logical-utilities check) and only merges
# into main if the gate passes. If it fails, a repair agent gets the failure
# log and up to REPAIR_ATTEMPTS tries. Still failing => the whole run stops,
# main stays clean, and the branch is left for you to inspect.
#
#   USAGE
#     ./run-all-phases.sh --preflight        # environment checks only, no work
#     DRY_RUN=1 ./run-all-phases.sh          # print the prompts + plan, run nothing
#     PHASES="2" ./run-all-phases.sh         # one phase, end to end
#     mkdir -p .runner-logs && nohup ./run-all-phases.sh > .runner-logs/run.log 2>&1 &
#
#   WATCH IT
#     tail -f .runner-logs/run.log
#     git log --oneline main
#
#   KNOBS (environment variables)
#     PHASES            phases to run            (default: "2 3 4 5 6 7 8 9")
#     MODEL             model for every phase    (default: opus)
#     PHASE_TIMEOUT     seconds per agent run    (default: 14400 = 4h)
#     REPAIR_ATTEMPTS   repair runs per phase    (default: 2)
#     PUSH              push main after a merge  (default: 1)
#     CLAUDE_BIN        path to the claude CLI   (default: auto-detected)
#     ALLOW_NO_MAPS_KEY run without a Google Maps key, map features deferred (default: 0)
#     LIMIT_RESUMES     usage-limit waits per phase before giving up (default: 8)
#     LIMIT_POLL        seconds to wait when no reset time is known  (default: 900)
#
#   HITTING A USAGE LIMIT MID-RUN
#     The run does not die: when a phase stops on a claude.ai usage limit, the
#     script reads resetsAt out of the transcript's rate_limit_event, sleeps
#     until then, and resumes THAT SAME session (--resume) so the phase keeps
#     its context instead of starting over. The watchdog knows the difference
#     between a limit wait and a hang, and only kills the latter.
#
# ---------------------------------------------------------------------------
# READ THIS ONCE BEFORE THE FIRST REAL RUN
#
# Each phase runs with --dangerously-skip-permissions: the agent edits files and
# runs shell commands for hours with nobody confirming anything. What protects
# you is that main is pushed to origin, this script never force-pushes and never
# rewrites history, and nothing reaches main without passing the gate above.
# ---------------------------------------------------------------------------

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT" || exit 1

LOG_DIR="$REPO_ROOT/.runner-logs"
PROMPT_FILE="$REPO_ROOT/docs/autonomous-run-prompt.md"

PHASES="${PHASES:-2 3 4 5 6 7 8 9}"
MODEL="${MODEL:-opus}"
PHASE_TIMEOUT="${PHASE_TIMEOUT:-14400}"
REPAIR_ATTEMPTS="${REPAIR_ATTEMPTS:-2}"
PUSH="${PUSH:-1}"
DRY_RUN="${DRY_RUN:-0}"
CLAUDE_BIN="${CLAUDE_BIN:-}"
CLAUDE="" # resolved by preflight (or lazily by run_agent)
ALLOW_NO_MAPS_KEY="${ALLOW_NO_MAPS_KEY:-0}"
LIMIT_RESUMES="${LIMIT_RESUMES:-8}"
LIMIT_POLL="${LIMIT_POLL:-900}"
MAPS_NOTE=""

# Applies to the runner's own invocations only — your interactive sessions keep
# whatever ~/.claude/settings.json says. Lets the CLI sit out a usage limit and
# carry on by itself; the script's own wait+resume is the backstop if it exits.
RUNNER_SETTINGS='{"autoContinueAtUsageLimit":true}'

PREFLIGHT_ONLY=0
case "${1:-}" in
  --preflight) PREFLIGHT_ONLY=1 ;;
  --help | -h)
    sed -n '3,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  "") ;;
  *)
    echo "Unknown argument: $1 (try --help)" >&2
    exit 2
    ;;
esac

mkdir -p "$LOG_DIR"

# --- small helpers ----------------------------------------------------------

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
# Same, but on stderr — for use inside $(...) capture, where stdout is the value.
logerr() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2; }
die() {
  log "FATAL: $*"
  notify "Handy runner stopped" "$*"
  exit 1
}

notify() {
  # Best-effort desktop notification so you know the run ended.
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"$2\" with title \"$1\"" >/dev/null 2>&1
  fi
  printf '\a'
}

# Phase label -> branch name. A case statement, not an associative array:
# macOS ships bash 3.2, where `declare -A` does not exist. That is exactly what
# killed the previous version of this script on line 1 of its only run.
phase_label() {
  case "$1" in
    2) echo "customer-job-flow" ;;
    3) echo "pro-onboarding-feed" ;;
    4) echo "realtime-bidding" ;;
    5) echo "live-tracking-price-update" ;;
    6) echo "payment-commission-receipt" ;;
    7) echo "admin-panel" ;;
    8) echo "content-seo" ;;
    9) echo "hardening-tests" ;;
    *) echo "unknown" ;;
  esac
}

# Pull one marked block out of the prompt file. Markers are matched exactly, so
# the prose above them (which mentions the marker names) is not picked up.
extract_block() {
  awk -v s="$1" -v e="$2" '
    $0 == s { inb = 1; next }
    $0 == e { inb = 0 }
    inb     { print }
  ' "$PROMPT_FILE"
}

find_claude() {
  if [ -n "$CLAUDE_BIN" ]; then
    [ -x "$CLAUDE_BIN" ] || die "CLAUDE_BIN is set to '$CLAUDE_BIN' but that is not executable."
    echo "$CLAUDE_BIN"
    return
  fi
  if command -v claude >/dev/null 2>&1; then
    command -v claude
    return
  fi
  # Fall back to the binary shipped inside the VS Code extension (newest first).
  local candidate
  candidate="$(ls -d "$HOME"/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude 2>/dev/null | sort -V | tail -n 1)"
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    echo "$candidate"
    return
  fi
  die "Could not find the 'claude' CLI. Install it (curl -fsSL https://claude.ai/install.sh | bash) or set CLAUDE_BIN=/path/to/claude."
}

# --- preflight --------------------------------------------------------------

preflight() {
  log "Preflight checks..."

  for cmd in git node npm npx jq docker awk; do
    command -v "$cmd" >/dev/null 2>&1 || die "'$cmd' is not installed / not on PATH."
  done

  CLAUDE="$(find_claude)" || exit 1
  log "  claude:   $CLAUDE ($("$CLAUDE" --version 2>&1 | head -n 1))"
  log "  model:    $MODEL"
  log "  phases:   $PHASES"

  [ -f "$PROMPT_FILE" ] || die "Prompt file missing: $PROMPT_FILE"
  [ -n "$(extract_block '<!-- PHASE_PROMPT -->' '<!-- END_PHASE_PROMPT -->')" ] ||
    die "Could not extract PHASE_PROMPT from $PROMPT_FILE"
  [ -n "$(extract_block '<!-- REPAIR_PROMPT -->' '<!-- END_REPAIR_PROMPT -->')" ] ||
    die "Could not extract REPAIR_PROMPT from $PROMPT_FILE"
  [ -n "$(extract_block '<!-- CONTINUE_PROMPT -->' '<!-- END_CONTINUE_PROMPT -->')" ] ||
    die "Could not extract CONTINUE_PROMPT from $PROMPT_FILE"

  [ -d "$REPO_ROOT/node_modules" ] || die "node_modules missing — run 'npm install' first."
  [ -f "$REPO_ROOT/.env.local" ] || die ".env.local missing — copy .env.example and fill it in."

  # Phase 2 (Places Autocomplete + geocoding) and Phase 5 (live map) need a real
  # Google Maps key. Better to refuse now than to discover it three hours in.
  if ! grep -q '^NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=.\+' "$REPO_ROOT/.env.local"; then
    if [ "$ALLOW_NO_MAPS_KEY" = "1" ]; then
      log "  WARNING: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is empty. Running anyway (ALLOW_NO_MAPS_KEY=1);"
      log "           map/address features will be built behind a fallback and marked 'ממתין למשתמש'."
      MAPS_NOTE="הערה על סביבה: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ריק ב-.env.local, אז אין לך מפתח
Google Maps אמיתי לעבוד מולו. תבנה את האינטגרציה במלואה (Places Autocomplete,
גיאוקוד, מפה) מאחורי בדיקה של קיום המפתח, עם fallback שמאפשר להזין כתובת ידנית
וגיאוקוד לפי הזנה ידנית או קואורדינטות ברירת מחדל בפיתוח — כך שה-build והטסטים
עוברים בלי מפתח. כל סעיף בהגדרת הסיום שדורש מפתח אמיתי — סמן ב-roadmap.md
כ\"ממתין למשתמש\" עם הסבר, ותמשיך."
    else
      die "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is empty in .env.local — Phase 2 (address autocomplete,
geocoding) and Phase 5 (live map) depend on it. Put a real key there, or re-run with
ALLOW_NO_MAPS_KEY=1 to build those features behind a fallback and defer them to you."
    fi
  fi

  local branch
  branch="$(git rev-parse --abbrev-ref HEAD)"
  [ "$branch" = "main" ] || die "Start the run from main (currently on '$branch')."
  [ -z "$(git status --porcelain)" ] || die "Working tree is dirty. Commit or stash first:
$(git status --short)"

  if git fetch origin main >/dev/null 2>&1; then
    local ahead behind
    ahead="$(git rev-list --count origin/main..main)"
    behind="$(git rev-list --count main..origin/main)"
    [ "$behind" = "0" ] || die "main is $behind commit(s) behind origin/main — pull first."
    [ "$ahead" = "0" ] || log "  WARNING: main is $ahead commit(s) ahead of origin/main (unpushed)."
  else
    log "  WARNING: could not reach origin — the run will work locally and skip pushing."
    PUSH=0
  fi

  docker info >/dev/null 2>&1 || die "Docker is not running — the local Supabase stack needs it."
  ensure_supabase
  check_api_and_headroom

  log "Preflight OK."
}

# One trivial (cheap-model) request: proves the CLI can actually reach the API
# before we commit to a long run, and reports how much of the usage window is
# left — an 8-phase Opus run against a nearly-full 7-day window will spend most
# of its night waiting.
check_api_and_headroom() {
  local probe="$LOG_DIR/preflight-probe.jsonl"
  if ! (cd /tmp && "$CLAUDE" -p "reply with exactly: ok" \
    --model claude-haiku-4-5-20251001 \
    --output-format stream-json --verbose) >"$probe" 2>"$LOG_DIR/preflight-probe.err"; then
    die "The claude CLI could not complete a trivial request. Check that you are signed in
(run 'claude' once interactively). Details: $LOG_DIR/preflight-probe.err"
  fi

  local five seven reset pct
  five="$(rl_field "$probe" '.unifiedWindows.five_hour.utilization')"
  seven="$(rl_field "$probe" '.unifiedWindows.seven_day.utilization')"
  reset="$(rl_field "$probe" '.unifiedWindows.five_hour.resetsAt')"

  if [ -n "$five" ]; then
    log "  usage:    five-hour window $(printf '%.0f' "$(echo "$five * 100" | bc -l 2>/dev/null || echo 0)")% used$([ -n "$reset" ] && echo ", resets $(date -r "$reset" '+%H:%M' 2>/dev/null)")"
  fi
  if [ -n "$seven" ]; then
    pct="$(printf '%.0f' "$(echo "$seven * 100" | bc -l 2>/dev/null || echo 0)")"
    log "            seven-day window ${pct}% used"
    if [ "$pct" -ge 80 ]; then
      log "  WARNING: the seven-day window is ${pct}% used. This run will spend a lot of time"
      log "           waiting for resets — consider starting it after the window rolls over."
    fi
  fi
}

ensure_supabase() {
  if npx supabase status >/dev/null 2>&1; then
    return 0
  fi
  log "  Local Supabase stack is down — starting it..."
  npx supabase start >"$LOG_DIR/supabase-start.log" 2>&1 ||
    die "npx supabase start failed — see $LOG_DIR/supabase-start.log"
  npx supabase status >/dev/null 2>&1 || die "Supabase still not reporting healthy after start."
}

# --- running the agent ------------------------------------------------------

# --- usage limits -----------------------------------------------------------
#
# The stream carries `rate_limit_event` objects:
#   {"type":"rate_limit_event","rate_limit_info":{"status":"allowed",
#    "resetsAt":1788380400,"rateLimitType":"five_hour","unifiedWindows":{...}}}
# The newest one tells us whether we are blocked and exactly when the window
# reopens — which is what lets a limit be a pause instead of a failed run.

rl_field() { # rl_field <jsonl> <jq expression against rate_limit_info>
  [ -f "$1" ] || return 1
  jq -r "select(.type == \"rate_limit_event\") | .rate_limit_info | $2 // empty" "$1" 2>/dev/null | tail -n 1
}

limit_blocked() {
  local status
  status="$(rl_field "$1" '.status')"
  [ -n "$status" ] && [ "$status" != "allowed" ]
}

# Was this run cut short by a usage limit (rather than finishing or crashing)?
stopped_by_limit() {
  local jsonl="$1" err="$2"
  limit_blocked "$jsonl" && return 0
  [ -f "$err" ] && grep -qiE 'usage limit|rate limit|limit reached|limit will reset' "$err" && return 0
  jq -r 'select(.type == "result") | [(.subtype // ""), (.terminal_reason // ""), (.result // "")] | @tsv' \
    "$jsonl" 2>/dev/null | grep -qiE 'usage limit|rate limit|limit reached|limit will reset'
}

session_id_of() {
  jq -r 'select(.session_id != null) | .session_id' "$1" 2>/dev/null | head -n 1
}

# Sleep until the limit window reopens, logging on stderr so callers can
# capture stdout. Falls back to fixed polling when no resetsAt is available.
wait_for_limit_reset() {
  local jsonl="$1" reset now target
  reset="$(rl_field "$jsonl" '.resetsAt')"
  now="$(date '+%s')"

  case "$reset" in
    '' | *[!0-9]*) target=$((now + LIMIT_POLL)) ;;
    *)
      if [ "$reset" -gt "$now" ]; then
        target=$((reset + 120)) # small buffer past the reset
      else
        target=$((now + LIMIT_POLL))
      fi
      ;;
  esac

  logerr "    Usage limit hit. Waiting until $(date -r "$target" '+%Y-%m-%d %H:%M' 2>/dev/null || echo "+$(((target - now) / 60))min"), then resuming this session."
  while :; do
    now="$(date '+%s')"
    [ "$now" -ge "$target" ] && break
    local left=$(((target - now)))
    [ "$left" -gt 600 ] && left=600
    sleep "$left"
    now="$(date '+%s')"
    if [ "$now" -lt "$target" ]; then
      logerr "    ...waiting for the limit to reset ($(((target - now) / 60)) min left)"
    fi
  done
}

# --- running the agent ------------------------------------------------------

# run_agent <prompt> <jsonl> <errlog> [resume-session-id]
# Prints the agent's final message on stdout, logs on stderr.
# Returns: the CLI's exit code, or 124 on a genuine hang.
run_agent() {
  local prompt="$1" jsonl="$2" err="$3" resume="${4:-}"
  [ -n "$CLAUDE" ] || CLAUDE="$(find_claude)"
  : >"$jsonl"
  : >"$err"

  if [ -n "$resume" ]; then
    "$CLAUDE" --resume "$resume" -p "$prompt" \
      --model "$MODEL" \
      --settings "$RUNNER_SETTINGS" \
      --dangerously-skip-permissions \
      --output-format stream-json \
      --verbose \
      >"$jsonl" 2>"$err" &
  else
    "$CLAUDE" -p "$prompt" \
      --model "$MODEL" \
      --settings "$RUNNER_SETTINGS" \
      --dangerously-skip-permissions \
      --output-format stream-json \
      --verbose \
      >"$jsonl" 2>"$err" &
  fi
  local pid=$!

  local started deadline now timed_out=0
  started="$(date '+%s')"
  deadline=$((started + PHASE_TIMEOUT))

  while kill -0 "$pid" 2>/dev/null; do
    sleep 15
    now="$(date '+%s')"
    if [ $(((now - started) % 300)) -lt 15 ]; then
      logerr "    ...still working ($(((now - started) / 60)) min, $(wc -l <"$jsonl" | tr -d ' ') events)"
    fi
    if [ "$now" -ge "$deadline" ]; then
      # A limit wait is not a hang: if the CLI is sitting on a usage limit
      # (autoContinueAtUsageLimit), give it until the window reopens.
      if limit_blocked "$jsonl"; then
        local reset
        reset="$(rl_field "$jsonl" '.resetsAt')"
        case "$reset" in
          '' | *[!0-9]*) deadline=$((now + LIMIT_POLL)) ;;
          *) [ "$reset" -gt "$now" ] && deadline=$((reset + 300)) || deadline=$((now + LIMIT_POLL)) ;;
        esac
        logerr "    Watchdog: agent is waiting on a usage limit, extending the deadline."
        continue
      fi
      logerr "    TIMEOUT after $(((now - started) / 60)) min with no usage limit in sight — killing the agent."
      kill -TERM "$pid" 2>/dev/null
      sleep 5
      kill -KILL "$pid" 2>/dev/null
      timed_out=1
      break
    fi
  done

  wait "$pid"
  local rc=$?
  [ "$timed_out" = "1" ] && return 124

  jq -r 'select(.type == "result") | .result // empty' "$jsonl" 2>/dev/null
  return $rc
}

# run_agent_until_done <prompt> <log-basename> <continue-prompt>
# Same contract as run_agent, but a usage limit becomes a wait + --resume of
# the same session instead of a failure. Returns 126 when the limit keeps
# stopping us after LIMIT_RESUMES waits.
run_agent_until_done() {
  local prompt="$1" base="$2" cont="$3"
  local jsonl="$LOG_DIR/${base}.jsonl" err="$LOG_DIR/${base}.err"
  local resumes=0 sid="" out rc

  while :; do
    if [ "$resumes" -eq 0 ]; then
      out="$(run_agent "$prompt" "$jsonl" "$err")"
      rc=$?
    else
      jsonl="$LOG_DIR/${base}-resume-${resumes}.jsonl"
      err="$LOG_DIR/${base}-resume-${resumes}.err"
      logerr "    Resuming session $sid (wait $resumes/$LIMIT_RESUMES)"
      out="$(run_agent "$cont" "$jsonl" "$err" "$sid")"
      rc=$?
    fi

    [ "$rc" = "124" ] && {
      printf '%s' "$out"
      return 124
    }

    if [ "$rc" != "0" ] && stopped_by_limit "$jsonl" "$err"; then
      [ -n "$sid" ] || sid="$(session_id_of "$jsonl")"
      if [ -z "$sid" ]; then
        logerr "    Usage limit hit but no session id in the transcript — cannot resume."
        printf '%s' "$out"
        return 126
      fi
      if [ "$resumes" -ge "$LIMIT_RESUMES" ]; then
        logerr "    Usage limit hit again after $LIMIT_RESUMES waits — giving up on this phase."
        printf '%s' "$out"
        return 126
      fi
      wait_for_limit_reset "$jsonl"
      resumes=$((resumes + 1))
      continue
    fi

    printf '%s' "$out"
    return $rc
  done
}

last_marker_line() {
  # Last non-empty line of the agent's final message.
  printf '%s\n' "$1" | awk 'NF { last = $0 } END { print last }'
}

# --- the quality gate -------------------------------------------------------

GATE_HARD_FAIL=""
GATE_SOFT_FAIL=""

gate_run() {
  local title="$1"
  shift
  echo "" >>"$GATE_LOG"
  echo "=== $title ===" >>"$GATE_LOG"
  if "$@" >>"$GATE_LOG" 2>&1; then
    log "    ok   $title"
    return 0
  fi
  log "    FAIL $title"
  GATE_HARD_FAIL="${GATE_HARD_FAIL}${GATE_HARD_FAIL:+, }$title"
  return 1
}

# quality_gate <branch> <gate-log>; sets GATE_HARD_FAIL / GATE_SOFT_FAIL.
quality_gate() {
  local branch="$1"
  GATE_LOG="$2"
  GATE_HARD_FAIL=""
  GATE_SOFT_FAIL=""
  : >"$GATE_LOG"

  log "  Quality gate for $branch"

  local head
  head="$(git rev-parse --abbrev-ref HEAD)"
  if [ "$head" != "$branch" ]; then
    log "    FAIL on branch (HEAD is '$head', expected '$branch')"
    GATE_HARD_FAIL="wrong branch"
    echo "HEAD is on '$head', expected '$branch'." >>"$GATE_LOG"
    return 1
  fi

  local dirty
  dirty="$(git status --porcelain)"
  if [ -n "$dirty" ]; then
    log "    FAIL clean working tree"
    GATE_HARD_FAIL="${GATE_HARD_FAIL}${GATE_HARD_FAIL:+, }uncommitted changes"
    {
      echo "=== uncommitted changes left behind ==="
      echo "$dirty"
    } >>"$GATE_LOG"
  else
    log "    ok   clean working tree"
  fi

  local commits
  commits="$(git rev-list --count "main..$branch")"
  if [ "$commits" -lt 1 ]; then
    log "    FAIL no commits on the branch"
    GATE_HARD_FAIL="${GATE_HARD_FAIL}${GATE_HARD_FAIL:+, }no commits"
    echo "The branch has no commits beyond main." >>"$GATE_LOG"
  else
    log "    ok   $commits commit(s) on the branch"
  fi

  # Secrets: never let a real key or a local env file reach main.
  local leaked
  leaked="$(git diff "main..$branch" --name-only | grep -E '^\.env(\.local|\.production)?$' || true)"
  local keyish
  keyish="$(git diff "main..$branch" -- . ':(exclude).env.example' |
    grep -E '^\+' | grep -Ev '^\+\+\+' |
    grep -E '(AIza[0-9A-Za-z_-]{20,}|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{20,}|SUPABASE_SERVICE_ROLE_KEY *= *[^ ]+)' || true)"
  if [ -n "$leaked" ] || [ -n "$keyish" ]; then
    log "    FAIL secret scan"
    GATE_HARD_FAIL="${GATE_HARD_FAIL}${GATE_HARD_FAIL:+, }possible secret in the diff"
    {
      echo "=== secret scan ==="
      [ -n "$leaked" ] && echo "env files in the diff: $leaked"
      [ -n "$keyish" ] && echo "$keyish"
    } >>"$GATE_LOG"
  else
    log "    ok   secret scan"
  fi

  gate_run "npm run lint" npm run lint
  gate_run "npm run typecheck" npm run typecheck
  gate_run "npm run build" npm run build
  gate_run "npm run db:reset" npm run db:reset
  gate_run "npm run db:test" npm run db:test

  # RTL: physical Tailwind utilities in added lines. Advisory — a regex cannot
  # tell a Tailwind class from a coincidence, and a false positive must not
  # abort a multi-hour run. It still goes to the repair agent, which can read
  # the code and judge.
  local rtl
  rtl="$(git diff "main..$branch" -- '*.tsx' '*.ts' '*.css' |
    grep -E '^\+' | grep -Ev '^\+\+\+' |
    grep -E '(^|[^a-zA-Z0-9_-])(ml|mr|pl|pr)-[0-9a-z[]|(^|[^a-zA-Z0-9_-])text-(left|right)([^a-zA-Z0-9_-]|$)|(^|[^a-zA-Z0-9_-])(left|right)-[0-9[]' || true)"
  if [ -n "$rtl" ]; then
    log "    WARN physical RTL utilities in added lines (advisory)"
    GATE_SOFT_FAIL="physical RTL utilities"
    {
      echo ""
      echo "=== RTL check (advisory): physical utilities found in added lines ==="
      echo "CLAUDE.md requires logical utilities only (ms-/me-/ps-/pe-/start-/end-/text-start/text-end)."
      echo "$rtl"
    } >>"$GATE_LOG"
  else
    log "    ok   RTL logical utilities"
  fi

  [ -z "$GATE_HARD_FAIL" ] && [ -z "$GATE_SOFT_FAIL" ]
}

# --- main -------------------------------------------------------------------

# Lets the helpers above be sourced and tested on their own:
#   RUNNER_LIB_ONLY=1 . ./run-all-phases.sh
[ "${RUNNER_LIB_ONLY:-0}" = "1" ] && return 0 2>/dev/null

preflight
if [ "$PREFLIGHT_ONLY" = "1" ]; then
  exit 0
fi

PHASE_TEMPLATE="$(extract_block '<!-- PHASE_PROMPT -->' '<!-- END_PHASE_PROMPT -->')"
REPAIR_TEMPLATE="$(extract_block '<!-- REPAIR_PROMPT -->' '<!-- END_REPAIR_PROMPT -->')"
CONTINUE_TEMPLATE="$(extract_block '<!-- CONTINUE_PROMPT -->' '<!-- END_CONTINUE_PROMPT -->')"

log "=== Handy autonomous phase runner ==="
[ "$DRY_RUN" = "1" ] && log "DRY_RUN=1 — printing the plan, running nothing."

STARTED_AT="$(date '+%s')"
COMPLETED=""

for n in $PHASES; do
  label="$(phase_label "$n")"
  [ "$label" = "unknown" ] && die "Phase $n is not one of 2..9."
  branch="phase-${n}-${label}"
  jsonl="$LOG_DIR/phase-${n}.jsonl"
  gate_log="$LOG_DIR/phase-${n}-gate.log"

  # Placeholder substitution, no sed: the prompt is Hebrew and full of
  # characters sed would happily mangle.
  prompt="${PHASE_TEMPLATE//__PHASE__/$n}"
  prompt="${prompt//__BRANCH__/$branch}"
  prompt="${prompt//__ENV_NOTES__/$MAPS_NOTE}"
  continue_prompt="${CONTINUE_TEMPLATE//__PHASE__/$n}"
  continue_prompt="${continue_prompt//__BRANCH__/$branch}"

  echo ""
  log "--- Phase $n ($label) --- branch: $branch"

  if [ "$DRY_RUN" = "1" ]; then
    echo "would run: git checkout main && git checkout -b $branch"
    echo "would run: $CLAUDE -p <prompt> --model $MODEL --dangerously-skip-permissions ..."
    echo "----- prompt -----"
    echo "$prompt"
    echo "----- end prompt -----"
    echo "would run: quality gate (lint, typecheck, build, db:reset, db:test, tree, secrets, RTL)"
    echo "would run: git checkout main && git merge --no-ff $branch"
    continue
  fi

  ensure_supabase

  git checkout main >/dev/null 2>&1 || die "Could not check out main."
  if git show-ref --verify --quiet "refs/heads/$branch"; then
    log "  Branch $branch already exists — reusing it."
    git checkout "$branch" >/dev/null 2>&1 || die "Could not check out $branch."
  else
    git checkout -b "$branch" >/dev/null 2>&1 || die "Could not create $branch."
  fi

  log "  Starting the phase agent (hang timeout ${PHASE_TIMEOUT}s, log: $jsonl)"
  result="$(run_agent_until_done "$prompt" "phase-${n}" "$continue_prompt")"
  rc=$?
  marker="$(last_marker_line "$result")"

  if [ "$rc" = "124" ]; then
    die "Phase $n hung for ${PHASE_TIMEOUT}s with no usage limit pending. Branch $branch left as-is; transcript: $jsonl"
  fi
  if [ "$rc" = "126" ]; then
    die "Phase $n could not get past the claude.ai usage limit after $LIMIT_RESUMES waits.
Branch $branch keeps the work done so far; transcript: $jsonl
Re-run when you have headroom — an existing phase branch is picked up, not recreated."
  fi
  log "  Agent finished (exit $rc). Last line: ${marker:-<empty>}"

  case "$marker" in
    PHASE_${n}_BLOCKED*)
      die "Phase $n reported BLOCKED: ${marker#PHASE_${n}_BLOCKED}
Branch $branch left as-is; transcript: $jsonl"
      ;;
  esac

  attempt=0
  while :; do
    if quality_gate "$branch" "$gate_log"; then
      break
    fi

    if [ "$attempt" -ge "$REPAIR_ATTEMPTS" ]; then
      if [ -z "$GATE_HARD_FAIL" ]; then
        log "  Gate passed on every hard check; advisory issue remains: $GATE_SOFT_FAIL"
        log "  Merging anyway — review $gate_log later."
        break
      fi
      die "Phase $n still failing after $REPAIR_ATTEMPTS repair attempt(s): $GATE_HARD_FAIL
main is untouched. Branch $branch and the failure log ($gate_log) are left for you."
    fi

    attempt=$((attempt + 1))
    log "  Gate failed (${GATE_HARD_FAIL:-$GATE_SOFT_FAIL}) — repair attempt $attempt/$REPAIR_ATTEMPTS"

    repair="${REPAIR_TEMPLATE//__PHASE__/$n}"
    repair="${repair//__BRANCH__/$branch}"
    repair="${repair//__GATE_LOG__/$gate_log}"
    repair="${repair//__ENV_NOTES__/$MAPS_NOTE}"

    repair_result="$(run_agent_until_done "$repair" "phase-${n}-repair-${attempt}" "$continue_prompt")"
    rrc=$?
    repair_marker="$(last_marker_line "$repair_result")"
    if [ "$rrc" = "124" ]; then
      die "Repair attempt $attempt for phase $n hung. Branch $branch left as-is."
    fi
    if [ "$rrc" = "126" ]; then
      die "Repair attempt $attempt for phase $n could not get past the usage limit. Branch $branch left as-is."
    fi
    log "  Repair agent finished (exit $rrc). Last line: ${repair_marker:-<empty>}"
    case "$repair_marker" in
      REPAIR_BLOCKED*)
        die "Repair for phase $n reported BLOCKED: ${repair_marker#REPAIR_BLOCKED}
main is untouched. Branch $branch and $gate_log are left for you."
        ;;
    esac
  done

  log "  Gate passed — merging $branch into main"
  git checkout main >/dev/null 2>&1 || die "Could not check out main to merge."
  git merge --no-ff "$branch" -m "Merge branch '$branch' into main" >/dev/null ||
    die "Merge of $branch into main failed (conflict?). Resolve by hand; nothing else was changed."

  if [ "$PUSH" = "1" ]; then
    if git push origin main >/dev/null 2>&1; then
      log "  Pushed main to origin."
    else
      log "  WARNING: could not push main to origin — the merge is local only."
    fi
  fi

  COMPLETED="${COMPLETED}${COMPLETED:+ }$n"
  log "--- Phase $n done and merged ---"
done

ELAPSED=$((($(date '+%s') - STARTED_AT) / 60))
echo ""
if [ "$DRY_RUN" = "1" ]; then
  log "=== DRY RUN finished. Nothing was changed. ==="
  exit 0
fi
log "=== Finished in ${ELAPSED} min. Phases merged into main: ${COMPLETED:-none} ==="
log "Next: open the app and walk the flows yourself — the gate proves the code is sound, not that the UI matches design/screens/."
notify "Handy runner finished" "Phases merged: ${COMPLETED:-none} (${ELAPSED} min)"
