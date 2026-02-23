#!/usr/bin/env bash
set -euo pipefail

show_help() {
  cat <<'EOF'
Usage: ci-local-pr.sh [options]

Run local PR preflight checks that mirror CI lanes.

Options:
  --skip-bun    Skip bun test lane.
  --skip-tests  Skip both node and bun test lanes.
  -h, --help    Show this help message.
EOF
}

skip_bun=false
skip_tests=false
current_step=""

step() {
  current_step="$1"
  printf '\n========== %s ==========\n' "$current_step"
}

trap 'status=$?; if [ "$status" -ne 0 ]; then printf "\n[ci-local] failed during: %s\n" "${current_step:-unknown}" >&2; fi' EXIT

while [ "$#" -gt 0 ]; do
  case "$1" in
    --)
      shift
      continue
      ;;
    --skip-bun)
      skip_bun=true
      ;;
    --skip-tests)
      skip_tests=true
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      show_help >&2
      exit 1
      ;;
  esac
  shift
done

step "Check lane: pnpm check"
pnpm check

step "Protocol lane: pnpm protocol:check"
pnpm protocol:check

if [ "$skip_tests" = true ]; then
  step "Skipping test lanes (--skip-tests)"
  echo "Node and bun test lanes were skipped."
  exit 0
fi

step "Node test lane"
OPENCLAW_TEST_WORKERS=2 OPENCLAW_TEST_MAX_OLD_SPACE_SIZE_MB=6144 pnpm canvas:a2ui:bundle && \
  OPENCLAW_TEST_WORKERS=2 OPENCLAW_TEST_MAX_OLD_SPACE_SIZE_MB=6144 pnpm test

if [ "$skip_bun" = true ]; then
  step "Skipping bun lane (--skip-bun)"
  echo "Bun test lane was skipped."
  exit 0
fi

step "Bun test lane"
pnpm canvas:a2ui:bundle && bunx vitest run --config vitest.unit.config.ts

step "Done"
echo "Local CI preflight completed successfully."
