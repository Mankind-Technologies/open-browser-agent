# Goal

Local automation of tasks browser tasks.

# Functionality

Chrome extension that the user can invoke on a tab via the extension popup, the user writes the task in the extension popup and the extension will run the task.

## Coding Agent Workflow

- Always finish changes by running compile and lint checks.
- Commands:
  - Build: `pnpm run build`
  - Typecheck: `pnpm run typecheck`
  - Lint: `pnpm run lint`
  - Full check before build: `pnpm run build:check`

Policy: All PRs and automated agent tasks must pass `pnpm run check` (typecheck + lint) and then `pnpm run build` locally before handoff.
