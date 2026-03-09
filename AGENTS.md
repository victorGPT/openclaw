# Repository Guidelines

- Repo: https://github.com/openclaw/openclaw
- In chat replies, file references must be repo-root relative only (example: `extensions/bluebubbles/src/channel.ts:80`); never absolute paths or `~/...`.
- Detailed, low-frequency operational recipes now live in the `openclaw-maintainer-runbook` skill under `skills/openclaw-maintainer-runbook/`. Read/use that skill only when the task touches release/publish/security advisories/docs plumbing/VM ops/macOS packaging/mobile platform maintenance/other infrequent operational work.

## High-Signal Rules

- GitHub issues/comments/PR comments: use literal multiline strings or `-F - <<'EOF'` (or `$'...'`) for real newlines; never embed `"\\n"`.
- GitHub comment footgun: never use `gh issue/pr comment -b "..."` when body contains backticks or shell chars. Always use single-quoted heredoc (`-F - <<'EOF'`) so no command substitution/escaping corruption.
- GitHub linking footgun: don’t wrap issue/PR refs like `#24643` in backticks when you want auto-linking. Use plain `#24643` (optionally add full URL).
- PR landing comments: always make commit SHAs clickable with full commit links (both landed SHA + source SHA when present).
- PR review conversations: if a bot leaves review conversations on your PR, address them and resolve those conversations yourself once fixed. Leave a conversation unresolved only when reviewer or maintainer judgment is still needed; do not leave bot-conversation cleanup to maintainers.
- GitHub searching footgun: don’t stop at the first 500 issues/PRs when the task is “search all”; keep paging unless the user asked for recent items only.
- Before security advisory triage/severity decisions, read `SECURITY.md`.
- Never edit `node_modules` (global/Homebrew/npm/git installs too). Updates overwrite. Put persistent notes in repo docs or skill files instead.
- Never update the Carbon dependency.
- Any dependency with `pnpm.patchedDependencies` must use an exact version (no `^`/`~`). Patching dependencies (pnpm patches, overrides, vendored changes) requires explicit approval.
- Ask before any publish/release step or version-number change.

## Auto-close labels (issues and PRs)

- If an issue/PR matches one of the reasons below, apply the label and let `.github/workflows/auto-response.yml` handle comment/close/lock.
- Do not manually close + manually comment for these reasons.
- Why: keeps wording consistent, preserves automation behavior (`state_reason`, locking), and keeps triage/reporting searchable by label.
- `r:*` labels can be used on both issues and PRs.

- `r: skill`: close with guidance to publish skills on Clawhub.
- `r: support`: close with redirect to Discord support + stuck FAQ.
- `r: no-ci-pr`: close test-fix-only PRs for failing `main` CI and post the standard explanation.
- `r: too-many-prs`: close when author exceeds active PR limit.
- `r: testflight`: close requests asking for TestFlight access/builds. OpenClaw does not provide TestFlight distribution yet, so use the standard response (“Not available, build from source.”) instead of ad-hoc replies.
- `r: third-party-extension`: close with guidance to ship as third-party plugin.
- `r: moltbook`: close + lock as off-topic (not affiliated).
- `invalid`: close invalid items (issues are closed as `not_planned`; PRs are closed).
- `dirty`: close PRs with too many unrelated/unexpected changes (PR-only label).

## PR truthfulness and bug-fix validation

- Never merge a bug-fix PR based only on issue text, PR text, or AI rationale.
- Before `/landpr`, run `/reviewpr` and require explicit evidence for bug-fix claims.
- Minimum merge gate for bug-fix PRs:
  1. symptom evidence (repro/log/failing test),
  2. verified root cause in code with file/line,
  3. fix touches the implicated code path,
  4. regression test (fail before/pass after) when feasible; if not feasible, include manual verification proof and why no test was added.
- If claim is unsubstantiated or likely hallucinated/BS: do not merge. Request evidence/changes, or close with `invalid` when appropriate.
- If linked issue appears wrong/outdated, correct triage first; do not merge speculative fixes.

## Project Structure

- Source: `src/` (`src/cli`, `src/commands`, `src/infra`, `src/media`, channel code under `src/telegram`, `src/discord`, `src/slack`, `src/signal`, `src/imessage`, `src/web`, `src/channels`, `src/routing`).
- Tests: colocated `*.test.ts`; e2e in `*.e2e.test.ts`.
- Docs: `docs/`.
- Extensions/plugins: `extensions/*`.
- Built output: `dist/`.
- Installers served from `https://openclaw.ai/*` live in sibling repo `../openclaw.ai`.
- When refactoring shared messaging logic, consider all built-in and extension channels.

## Docs

- Docs are hosted on Mintlify (`docs.openclaw.ai`). When working on docs, read the mintlify skill.
- Internal doc links in `docs/**/*.md`: root-relative, no `.md`/`.mdx` suffix (example: `[Config](/configuration)`).
- For docs, UI copy, and picker lists, order services/providers alphabetically unless the section is explicitly describing runtime behavior (for example auto-detection or execution order).
- Section cross-references: use anchors on root-relative paths (example: `[Hooks](/configuration#hooks)`).
- Doc headings and anchors: avoid em dashes and apostrophes in headings because they break Mintlify anchor links.
- When Peter asks for links, reply with full `https://docs.openclaw.ai/...` URLs (not root-relative).
- When you touch docs, end the reply with the `https://docs.openclaw.ai/...` URLs you referenced.
- `docs/zh-CN/**` is generated; do not edit it unless the user explicitly asks.
- README links should stay absolute (`https://docs.openclaw.ai/...`).
- Docs must stay generic: no personal device names/hostnames/paths.

## Build, Test, and Dev

- Runtime baseline: Node 22+.
- Install deps: `pnpm install` (also keep Bun compatibility intact when touching deps/patches).
- Prefer Bun for TS execution: `bun <file.ts>` / `bunx <tool>`.
- Run CLI in dev: `pnpm openclaw ...` or `pnpm dev`.
- Build/typecheck: `pnpm build`, `pnpm tsgo`.
- Lint/format: `pnpm check`, `pnpm format`, `pnpm format:fix`.
- Tests: `pnpm test`; coverage: `pnpm test:coverage`.
- If a requested build/test/lint command fails because deps are missing, install with the repo package manager, then rerun the exact command once.

## Coding Style

- TypeScript (ESM), prefer strict types, avoid `any`.
- Run Oxlint/Oxfmt via `pnpm check` before shipping changes.
- Never add `@ts-nocheck` or disable `no-explicit-any`; fix root causes instead.
- Dynamic import guardrail: don’t mix `await import("x")` and static `import ... from "x"` for the same production module path. If lazy loading is needed, create a dedicated `*.runtime.ts` boundary.
- After lazy-loading/module-boundary refactors, run `pnpm build` and check for `[INEFFECTIVE_DYNAMIC_IMPORT]` warnings.
- Do not share class behavior via prototype mutation; use explicit inheritance/composition.
- In tests, prefer per-instance stubs over prototype mutation unless the test explicitly justifies it.
- Add brief comments for tricky logic.
- Keep files concise; extract helpers instead of “V2” copies.
- Use **OpenClaw** for product/app/docs headings; use `openclaw` for CLI/package/path/config names.

## Tests and Changelog

- Vitest coverage thresholds target 70% lines/branches/functions/statements.
- Do not set test workers above 16.
- For memory-constrained hosts, use `OPENCLAW_TEST_PROFILE=low OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test`.
- User-facing changes go in `CHANGELOG.md`; internal/meta-only notes usually do not.
- Append changelog entries to the end of the active version section; do not insert at the top.
- Pure test-only changes usually do not need a changelog entry unless user-facing behavior changed or the user asked.

## Commits and PRs

- `/landpr` lives in the global Codex prompts (`~/.codex/prompts/landpr.md`); when landing or merging any PR, always follow that `/landpr` process.
- Create commits with `scripts/committer "<msg>" <file...>`; avoid manual `git add`/`git commit` so staging stays scoped.
- Use concise, action-oriented commit messages.
- Keep commits grouped by related change.
- PR template: `.github/pull_request_template.md`.
- When working on a GitHub issue or PR, print the full URL at the end of the task.

## Multi-Agent Safety

- Do not create/apply/drop `git stash` entries unless explicitly requested (including `git pull --rebase --autostash`).
- Do not create/remove/modify git worktrees unless explicitly requested.
- Do not switch branches unless explicitly requested.
- Running multiple agents is OK as long as each uses its own session.
- If you see unrelated files, keep going; focus on your changes and commit only those.
- If the user says “push”, you may `git pull --rebase` to integrate latest changes. If the user says “commit”, scope to your changes only. If they say “commit all”, commit everything in grouped chunks.

## Critical Repo-Specific Notes

- If adding a new `AGENTS.md` anywhere in the repo, also add a `CLAUDE.md` symlink pointing to it.
- Status output should use `src/terminal/table.ts`; CLI progress should use `src/cli/progress.ts`.
- Gateway on macOS currently runs through the menubar app; restart via the app or `scripts/restart-mac.sh`, not ad-hoc tmux sessions.
- Do not rebuild the macOS app over SSH.
- Never send streaming/partial replies to external messaging surfaces; only final replies should be delivered there.
- When answering questions, verify in code when possible; do not guess.
