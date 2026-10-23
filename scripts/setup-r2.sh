#!/usr/bin/env bash
#
# Walks a self-hoster through storing Nudge's Attachments in a Cloudflare R2 bucket: create the
# bucket and a bucket-scoped API token in the dashboard, build the .env settings, copy existing
# Attachments across and test the bucket.
#
# Run it from the folder that holds compose.yaml and .env (the repository root, or wherever you
# downloaded the stack):
#   bash scripts/setup-r2.sh
#
# .env is only ever appended to, never rewritten through a temporary file, so the secret key
# reaches disk in .env alone.

set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────
# Wizard library
# ──────────────────────────────────────────────────────────────────────────

if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  BOLD=$(tput bold); DIM=$(tput dim); RESET=$(tput sgr0)
  BLUE=$(tput setaf 4); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3); RED=$(tput setaf 1)
else
  BOLD=""; DIM=""; RESET=""; BLUE=""; GREEN=""; YELLOW=""; RED=""
fi

_STAGE_INDEX=0
ENV_FILE="${ENV_FILE:-.env}"

# _clear wipes the terminal so only the current step is on screen. No-op when
# output isn't a terminal, so piped logs stay readable.
_clear() {
  [[ -t 1 ]] || return 0
  if command -v tput >/dev/null 2>&1; then tput clear; else printf '\033[2J\033[3J\033[H'; fi
}

# banner "Title" shows the opening frame: what this wizard does.
banner() {
  _clear
  printf '\n%s%s  %s%s\n' "$BOLD" "$BLUE" "$1" "$RESET"
  printf '%s  %s stages%s\n\n' "$DIM" "$TOTAL_STAGES" "$RESET"
  printf '%s  You drive the browser; this wizard tells you exactly what to do and\n' "$DIM"
  printf '  captures the values you copy back. Stop any time with Ctrl-C and re-run\n'
  printf '  later; values already in .env are offered as defaults.%s\n' "$RESET"
  pause "Ready to start?"
}

# stage "Name" clears the screen, then announces a stage and shows progress.
stage() {
  _clear
  _STAGE_INDEX=$((_STAGE_INDEX + 1))
  printf '\n%s%s▸ Stage %s/%s · %s%s\n' \
    "$BOLD" "$BLUE" "$_STAGE_INDEX" "$TOTAL_STAGES" "$1" "$RESET"
}

say()  { printf '  %s\n' "$1"; }
step() { printf '  %s•%s %s\n' "$BLUE" "$RESET" "$1"; }
note() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
warn() { printf '  %s⚠ %s%s\n' "$YELLOW" "$1" "$RESET"; }
fail() { printf '  %s✗ %s%s\n' "$RED" "$1" "$RESET"; }
ok()   { printf '  %s✓ %s%s\n' "$GREEN" "$1" "$RESET"; }

# open_url URL opens it in the human's browser, cross-platform incl. WSL.
open_url() {
  local url="$1"
  printf '  %s↗ opening%s %s\n' "$GREEN" "$RESET" "$url"
  { if   command -v wslview     >/dev/null 2>&1; then wslview "$url"
    elif command -v explorer.exe >/dev/null 2>&1; then explorer.exe "$url"
    elif command -v xdg-open    >/dev/null 2>&1; then xdg-open "$url"
    elif command -v open        >/dev/null 2>&1; then open "$url"
    else warn "couldn't open a browser; visit it manually: $url"; fi
  } >/dev/null 2>&1 || warn "couldn't open a browser, so visit it manually: $url"
}

# pause "msg" waits for the human to confirm they've done the manual part.
pause() {
  printf '  %s%s%s ' "$DIM" "${1:-Press Enter to continue}" "$RESET"
  read -r _ || true
}

# confirm "question" is a y/N gate; returns success on yes.
confirm() {
  local reply=""
  printf '  %s? %s [y/N] ' "$YELLOW" "$1"
  read -r reply || true
  [[ "$reply" =~ ^[Yy] ]]
}

# _existing KEY: current value of KEY in ENV_FILE, if any.
_existing() {
  [[ -f "$ENV_FILE" ]] || return 1
  local line; line=$(grep -E "^${1}=" "$ENV_FILE" | tail -n1) || return 1
  printf '%s' "${line#*=}"
}

# ask KEY "Prompt" [hidden] reads a value into $KEY, offering the existing
# .env value as a default on re-runs (Enter keeps it). Keeps asking until it
# gets one. A third argument hides the input, for secrets.
ask() {
  local key="$1" prompt="$2" hidden="${3:-}" current input=""
  current=$(_existing "$key" || true)
  while [[ -z "$input" ]]; do
    if [[ -n "$current" ]]; then
      printf '  %s%s%s %s[Enter keeps current]%s ' "$BOLD" "$prompt" "$RESET" "$DIM" "$RESET"
    else
      printf '  %s%s%s ' "$BOLD" "$prompt" "$RESET"
    fi
    if [[ -n "$hidden" ]]; then
      read -rs input || true
      printf '\n'
    else
      read -r input || true
    fi
    [[ -z "$input" && -n "$current" ]] && input="$current"
  done
  printf -v "$key" '%s' "$input"
}

# ──────────────────────────────────────────────────────────────────────────
# Nudge helpers
# ──────────────────────────────────────────────────────────────────────────

USE_DOCKER=false
if command -v docker >/dev/null 2>&1 && [[ -f compose.yaml ]]; then
  USE_DOCKER=true
fi

# manage NAME runs a Django management command in the Docker stack. The web
# service applies migrations when it starts, so a one-off run skips them.
manage() {
  docker compose run --rm -e NUDGE_RUN_MIGRATIONS=false web python manage.py "$1"
}

# manage_command NAME prints how to run a Django management command here.
manage_command() {
  if $USE_DOCKER; then
    printf 'docker compose run --rm -e NUDGE_RUN_MIGRATIONS=false web python manage.py %s' "$1"
  else
    printf 'uv run --directory backend python manage.py %s' "$1"
  fi
}

# env_block prints the .env settings for the bucket.
env_block() {
  printf '%s\n' \
    "NUDGE_STORAGE_BUCKET=$NUDGE_STORAGE_BUCKET" \
    "NUDGE_STORAGE_ENDPOINT_URL=$NUDGE_STORAGE_ENDPOINT_URL" \
    "NUDGE_STORAGE_ACCESS_KEY_ID=$NUDGE_STORAGE_ACCESS_KEY_ID" \
    "NUDGE_STORAGE_SECRET_ACCESS_KEY=$NUDGE_STORAGE_SECRET_ACCESS_KEY" \
    "NUDGE_STORAGE_REGION=auto"
}

# local_attachment_count prints how many Attachment files are still on disk.
local_attachment_count() {
  if $USE_DOCKER; then
    docker compose run --rm -T -e NUDGE_RUN_MIGRATIONS=false web sh -c \
      'find "${NUDGE_MEDIA_ROOT:-/app/backend/media}/attachments" -type f 2>/dev/null | wc -l'
  else
    local media_root
    media_root=$(_existing NUDGE_MEDIA_ROOT || echo backend/media)
    find "$media_root/attachments" -type f 2>/dev/null | wc -l
  fi | tr -d '[:space:]'
}

# ──────────────────────────────────────────────────────────────────────────
# STAGES
# ──────────────────────────────────────────────────────────────────────────

TOTAL_STAGES=6

banner "Store Nudge Attachments in Cloudflare R2"

stage "Create the bucket"
say "Attachments go in a private R2 bucket of their own."
open_url "https://dash.cloudflare.com/?to=/:account/r2/overview"
step "Sign in and pick your account if asked."
step "Click 'Create bucket'."
step "Name it, for example nudge-attachments. Leave Location on Automatic."
step "Click 'Create bucket'. Leave public access off: Nudge serves downloads itself."
ask NUDGE_STORAGE_BUCKET "Bucket name:"

stage "Create an API token for that bucket"
say "The token only needs to read, write and delete objects in this one bucket,"
say "so a leaked key can't touch anything else."
open_url "https://dash.cloudflare.com/?to=/:account/r2/api-tokens"
step "Click 'Create Account API token'."
step "Name it, for example Nudge."
step "Permissions: choose 'Object Read & Write'."
step "Specify bucket(s): choose 'Apply to specific buckets only' and pick $NUDGE_STORAGE_BUCKET."
step "TTL: Forever. Leave Client IP Address Filtering empty."
step "Click 'Create Account API token'."
warn "The next page shows the Secret Access Key only once. Keep it open for the next stage."
pause "Press Enter once you see the token's keys"

stage "Copy the account and token details"
say "The token page shows an Access Key ID and a Secret Access Key. The Account ID"
say "is on the R2 overview page, under Account Details, and in the S3 endpoint URL."
ask R2_ACCOUNT_ID "Account ID:"
NUDGE_STORAGE_ENDPOINT_URL="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
note "Endpoint: $NUDGE_STORAGE_ENDPOINT_URL"
ask NUDGE_STORAGE_ACCESS_KEY_ID "Access Key ID:"
ask NUDGE_STORAGE_SECRET_ACCESS_KEY "Secret Access Key (hidden):" hidden

stage "Save the settings"
say "Add these lines to $ENV_FILE:"
printf '\n'
env_block | sed 's/^/    /'
printf '\n'
APPENDED=false
if [[ -f "$ENV_FILE" ]] && grep -qE '^NUDGE_STORAGE_' "$ENV_FILE"; then
  warn "$ENV_FILE already has NUDGE_STORAGE_ settings. Replace them by hand with the lines above."
elif confirm "Append to $ENV_FILE?"; then
  # Start on a new line if the file doesn't end with one.
  if [[ -s "$ENV_FILE" && -n "$(tail -c1 "$ENV_FILE")" ]]; then
    printf '\n' >> "$ENV_FILE"
  fi
  env_block >> "$ENV_FILE"
  APPENDED=true
  ok "appended to $ENV_FILE"
else
  note "Not written. Copy the lines above into $ENV_FILE yourself."
fi
pause

COPY_COMMAND=$(manage_command copy_media_to_storage)
CHECK_COMMAND=$(manage_command check_storage)
RUN_HERE=false
if $USE_DOCKER && $APPENDED; then
  RUN_HERE=true
fi
WHEN_READY="Run"
if ! $APPENDED; then
  WHEN_READY="Once the settings are in $ENV_FILE, run"
fi

stage "Copy existing Attachments"
count=$(local_attachment_count || true)
if ! [[ "$count" =~ ^[0-9]+$ ]]; then
  warn "Couldn't count the Attachments on disk."
  say "If there are any, copy them to the bucket once the settings are in $ENV_FILE:"
  printf '\n    %s\n\n' "$COPY_COMMAND"
elif (( count == 0 )); then
  ok "No Attachments on disk; nothing to copy."
else
  say "$count Attachment files are stored on disk. Copy them so they keep working."
  say "Local files stay where they are; delete them yourself once you've checked the bucket."
  if ! $RUN_HERE; then
    say "Files already in the bucket are skipped. $WHEN_READY:"
    printf '\n    %s\n\n' "$COPY_COMMAND"
  elif confirm "Copy $count existing files to R2?"; then
    manage copy_media_to_storage || warn "The copy failed; fix the error above and run: $COPY_COMMAND"
  else
    note "Skipped. Copy them later with: $COPY_COMMAND"
  fi
fi
pause

stage "Test the bucket"
if $RUN_HERE; then
  say "Writing, reading back and deleting a test file in $NUDGE_STORAGE_BUCKET..."
  if manage check_storage; then
    ok "R2 works. Restart Nudge to use it: docker compose up -d"
  else
    fail "The test failed. The error above says why: a wrong key, bucket name or endpoint,"
    fail "or a token without Object Read & Write on this bucket. Fix $ENV_FILE and run:"
    printf '\n    %s\n' "$CHECK_COMMAND"
  fi
else
  say "Test the bucket with a throwaway file. $WHEN_READY:"
  printf '\n    %s\n\n' "$CHECK_COMMAND"
  say "Then restart Nudge so it uses the bucket."
fi
printf '\n'
