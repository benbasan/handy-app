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
ALLOW_NO_MAPS_KEY="${ALLOW_NO_MAPS_KEY:-0}"
MAPS_NOTE=""

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

  [ -d "$REPO_ROOT/node_modules" ] || die "node_modules missing — run 'npm install' first."
  [ -f "$REPO_ROOT/.env.local" ] || die ".env.local missing — copy .env.example and fill it in."

  # Phase 2 (Places Autocomplete + geocoding) and Phase 5 (live map) need a real
  # Google Maps key. Better to refuse now than to discover it three hours in.
  if ! grep -q '^NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=.\+' "$REPO_ROOT/.env.local"; then
    if [ "$ALLOW_NO_MAPS_KEY" = "1" ]; then
      log "  WARNING: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is empty. Running anyway (ALLOW_NO_MAPS_KEY=1);"
      log "           map/address features will be built behind a fallback and marked 'ממתין למשתמש'."
      MAPS_NOTE="

הערה על סביבה: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ריק ב-.env.local, אז אין לך מפתח
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

  log "Preflight OK."
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

# run_agent <prompt> <jsonl-log>; prints the agent's final message on stdout,
# returns 124 on timeout, otherwise the CLI's exit code.
run_agent() {
  local prompt="$1" jsonl="$2"
  : >"$jsonl"

  "$CLAUDE" -p "$prompt" \
    --model "$MODEL" \
    --dangerously-skip-permissions \
    --output-format stream-json \
    --verbose \
    >"$jsonl" 2>&1 &
  local pid=$!

  local waited=0 timed_out=0
  while kill -0 "$pid" 2>/dev/null; do
    sleep 15
    waited=$((waited + 15))
    if [ $((waited % 300)) -eq 0 ]; then
      logerr "    ...still working (${waited}s elapsed, $(wc -l <"$jsonl" | tr -d ' ') events)"
    fi
    if [ "$waited" -ge "$PHASE_TIMEOUT" ]; then
      logerr "    TIMEOUT after ${waited}s — killing the agent."
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

  # The final assistant message lives in the terminal "result" event.
  jq -r 'select(.type == "result") | .result // empty' "$jsonl" 2>/dev/null
  return $rc
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

preflight
if [ "$PREFLIGHT_ONLY" = "1" ]; then
  exit 0
fi

PHASE_TEMPLATE="$(extract_block '<!-- PHASE_PROMPT -->' '<!-- END_PHASE_PROMPT -->')"
REPAIR_TEMPLATE="$(extract_block '<!-- REPAIR_PROMPT -->' '<!-- END_REPAIR_PROMPT -->')"

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
  prompt="${prompt}${MAPS_NOTE}"

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

  log "  Starting the phase agent (timeout ${PHASE_TIMEOUT}s, log: $jsonl)"
  result="$(run_agent "$prompt" "$jsonl")"
  rc=$?
  marker="$(last_marker_line "$result")"

  if [ "$rc" = "124" ]; then
    die "Phase $n hit the ${PHASE_TIMEOUT}s timeout. Branch $branch left as-is; transcript: $jsonl"
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

    repair_jsonl="$LOG_DIR/phase-${n}-repair-${attempt}.jsonl"
    repair_result="$(run_agent "$repair" "$repair_jsonl")"
    rrc=$?
    repair_marker="$(last_marker_line "$repair_result")"
    if [ "$rrc" = "124" ]; then
      die "Repair attempt $attempt for phase $n timed out. Branch $branch left as-is."
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
