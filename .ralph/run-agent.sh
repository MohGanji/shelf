#!/usr/bin/env bash
#

# Loop from repo root (logs each exit code):
#   while true; do .ralph/run-agent.sh; echo "[$(date -Iseconds)] exit=$?"; done
#

# Runs Cursor `agent` with the prompt from prompt.md (`-f` = --force, `-p` = --print).
# `--print` output is appended to agent.log (see .gitignore).
set -euo pipefail

RALPH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${RALPH_DIR}/.." && pwd)"
PROMPT_FILE="${RALPH_DIR}/prompt.md"
LOG_FILE="${RALPH_DIR}/agent.log"

if [[ ! -f "${PROMPT_FILE}" ]]; then
  echo "error: missing ${PROMPT_FILE}" >&2
  exit 1
fi

PROMPT_TEXT="$(cat "${PROMPT_FILE}")"

{
  echo ""
  echo "======== $(date -Iseconds) — agent run ========"
  # --trust is required for headless --print mode per `agent --help`
  agent -f -p --trust --workspace "${REPO_ROOT}" -- "${PROMPT_TEXT}"
} >> "${LOG_FILE}" 2>&1

echo "Log: ${LOG_FILE}" >&2
