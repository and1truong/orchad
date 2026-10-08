# Orchad agent instructions

## Ponytail

Ponytail is enabled in **full** mode by default for coding tasks in this repository.
Before writing, fixing, refactoring, reviewing, or designing code, read and apply
[the Ponytail skill](.agents/skills/ponytail/SKILL.md). Reuse existing code, the
standard library, native platform features, and installed dependencies before
adding code or dependencies. Trace the actual flow and fix root causes.

Honor explicit user requirements and the project's existing contracts, security,
trust-boundary validation, data-loss protection, accessibility, and required
checks. Ponytail does not waive existing test suites or acceptance criteria;
use the project's existing verification tools rather than adding a test framework.

Keep each concurrent session's work isolated. Do not reset, overwrite, rebase,
or merge another session's branches or worktrees. Follow the current task's
branch and stacked-PR conventions.

The user can select `/ponytail lite`, `/ponytail full`, or `/ponytail ultra`
for the current session, or disable it with `stop ponytail` / `normal mode`.
This project installation provides instructions and the core skill; it does
not install plugin lifecycle hooks or a native slash-command menu.

## Source

The skill body is copied unchanged from
[DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)
at commit `552acd5efd0aeae2583a12efe39373d2f076f25e` under the MIT license. Its frontmatter uses only Codex's name and description fields.
See [.agents/skills/ponytail/LICENSE](.agents/skills/ponytail/LICENSE).
