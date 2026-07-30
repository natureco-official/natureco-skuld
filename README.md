# Skuld

[![CI](https://github.com/natureco-official/natureco-skuld/actions/workflows/test.yml/badge.svg)](https://github.com/natureco-official/natureco-skuld/actions/workflows/test.yml)
[![CodeQL](https://github.com/natureco-official/natureco-skuld/actions/workflows/codeql.yml/badge.svg)](https://github.com/natureco-official/natureco-skuld/actions/workflows/codeql.yml)
[![npm](https://img.shields.io/npm/v/natureco-skuld?color=7dd3fc)](https://www.npmjs.com/package/natureco-skuld)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-7dd3fc)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-7dd3fc.svg)](LICENSE)
[![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-7dd3fc)](#system-requirements)

```text
  █▀▀  █▄▀  █ █  █    █▀▄
  ▀▀█  █▀▄  █ █  █    █ █
  ▀▀▀  ▀ ▀  ▀▀▀  ▀▀▀  ▀▀

  ne olacaksa, doğrulanmış olarak.
```

**Skuld is a coding-first AI agent for the terminal.** It can inspect a repository, edit files, run commands, test its work, use Git and GitHub, delegate focused tasks, retain durable context, and refuse to call a change complete without evidence.

Skuld takes the coding workflow developed in NatureCo Code and ships it as a focused, standalone product under its own identity. The animated Skuld hero, full-screen coding surface, security gates, memory engine, and release checks are part of the product—not a thin chat wrapper.

> **Release status:** `0.1.0` is the first public release candidate. The package is being verified locally before its first npm and GitHub publication.

## Why Skuld

- **Coding is the default.** Run `nskuld` and land directly in the coding workspace.
- **Rich terminal UI.** Fixed hero and status areas, a stable composer, scrollable conversation history, streamed Markdown, diffs, tool cards, animations, and ice-blue visual language.
- **Real agent loop.** Tool calls continue until the model returns a final answer; empty provider replies and malformed calls are surfaced instead of silently ending the task.
- **70 first-party coding capabilities.** 54 manifest-backed tools plus 16 runtime tools before optional MCP tools are added.
- **Evidence before completion.** Post-change checks, quality gates, protected-path policy, CodeDNA integration, and honest incomplete-state reporting.
- **Durable memory.** Urðr-backed retrieval, project context, resumable sessions, and cross-session recall.
- **Provider choice without catalogue drift.** Live model discovery when supported, with one shared fallback catalogue used by setup, `models`, and `/model`.
- **Remote coding without channel clutter.** Telegram is the intentionally supported remote-coding surface.
- **Private by layout.** Installed application code and personal state live in different directories; `~/.nskuld` is never part of the npm package.

## Quick start

### Install

```bash
npm install -g natureco-skuld
nskuld setup
nskuld
```

The first run configures a provider and model. You can also sign in with a NatureCo account:

```bash
nskuld account login
nskuld account whoami
```

### Open a project

```bash
cd path/to/project
nskuld
```

Or select the workspace explicitly:

```bash
nskuld code --dir path/to/project
```

### Run one task from a script or CI job

```bash
nskuld code --dir path/to/project -p "Inspect the failing tests and explain the root cause"
```

Headless mode uses the same model and tool pipeline, but interactive approval is unavailable. Operations that require human approval fail closed.

## The coding workspace

Skuld opens in a full-screen application view when the terminal supports it. The hero and composer remain fixed while the conversation body scrolls independently.

```text
╭ SKULD // CODE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ v0.1.0 ╮
│ ◇ project  C:\work\my-app  git main (2)                               │
│ ⚡ MiniMax-M2.7  tools 70  context 18%                                │
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯
```

Use `--minimal` for traditional terminal scrollback or `SKULD_PLAIN_INPUT=1` for the classic line editor.

### In-session commands

| Command | Purpose |
|---|---|
| `/help` | Show all coding-screen commands |
| `/model [number-or-id]` | Discover, list, and switch models |
| `/tools` | List tools loaded for the session |
| `/system` | Show the real package, data, config, log, and project paths |
| `/context` | Show current context usage |
| `/compact` | Compact provider context without deleting visual history |
| `/run <command>` | Run a command and add its output to context |
| `/test` | Detect and run the project test command |
| `/git` | Show Git status and recent commits |
| `/commit` | Commit staged changes with an AI-generated message |
| `/undo [file]` | Restore the last captured file snapshot |
| `/retry` | Retry the previous user request |
| `/index` | Re-index the active project |
| `/memory` | Show project memory |
| `/plan on\|approve\|reject\|show` | Control plan mode |
| `/summary` | Show the session summary |
| `/done` | Save, summarize, and exit |
| `/fullscreen` / `/minimal` | Switch the terminal presentation mode |
| `Ctrl+O` | Open or close the detailed tool transcript |
| `Esc` | Interrupt the current model/tool turn safely |
| `Ctrl+C` | Exit |

## Tools

Skuld's public coding boundary is deliberately smaller than the inherited general-assistant surface. Only tools that support software work are loaded into the coding manifest.

### 54 built-in coding tools

| Area | Tools |
|---|---|
| Files and patches | `read_file`, `write_file`, `edit_file`, `structural_patch`, `notebook_edit`, `list_dir`, `file_search`, `grep_search`, `filesystem`, `file_state`, `checkpoint` |
| Commands and source control | `bash`, `shell_command`, `code_execution`, `git`, `skuld_system` |
| Planning and delegation | `plan`, `todo_write`, `clarify`, `blueprint`, `workflow`, `sub_agent`, `delegate_task`, `async_delegation`, `llm_task` |
| Memory and skills | `memory`, `memory_search`, `memory_write`, `memory_tree`, `cross_session_memory`, `session_search`, `skill_find`, `skill_view`, `skills_list`, `skills_autoload` |
| Research and browser verification | `web_search`, `web_readability`, `duckduckgo_search`, `exa_search`, `searxng_search`, `parallel_search`, `firecrawl`, `http_request`, `url_safety`, `browser`, `browser_use`, `computer_use`, `computer_use_loop`, `macos_screenshot` |
| Assets and inspection | `document_extract`, `image_generation`, `media_understanding`, `pii_redact` |
| Security | `approval` |

### 16 runtime tools

The coding session also injects plan-mode entry/exit, isolated worktree entry/exit, background task create/list/result/stop, session search, file history/restore, multi-focus review, scheduled task add/list/remove, and `enable_tools`.

To reduce prompt cost, Skuld advertises a core schema set first. The model can load any hidden coding schema with `enable_tools`; execution remains available immediately after activation. `--all-tools` sends all schemas up front when token cost is not a concern.

### MCP

Configured Model Context Protocol servers are loaded into the same coding loop. Name collisions are rejected in favor of the built-in safety-reviewed tool.

```bash
nskuld mcp list
nskuld mcp add <name> <command>
nskuld mcp test <name>
```

## Git and GitHub workflows

Skuld can inspect history and diffs, create commits, review changes, and clone an HTTPS GitHub repository into a child of the active workspace. After cloning, it reads repository instructions such as `AGENTS.md`, `README.md`, and package manifests before running setup commands.

Examples:

```text
Clone https://github.com/owner/project into this workspace, install it using
the repository instructions, run its verification command, and report evidence.
```

```text
Review the current diff for security and logic regressions. Fix confirmed
issues, run the relevant tests, then summarize the exact files changed.
```

Repository installation, dependency installation, publishing, destructive Git operations, and other consequential actions remain behind approval and path-policy checks.

## Models and providers

Setup, `nskuld models`, and the in-session `/model` picker share the same catalogue. Skuld first tries the provider's live models endpoint and falls back to the bundled catalogue only when discovery is unavailable.

The release catalogue currently contains **18 providers and 75 model entries**:

| Provider | Bundled entries | Default route |
|---|---:|---|
| OpenAI | 4 | `gpt-5.6-sol` |
| Anthropic | 5 | `claude-fable-5` |
| Google Gemini | 5 | `gemini-3.5-flash` |
| Groq | 5 | `openai/gpt-oss-120b` |
| DeepSeek | 2 | `deepseek-chat` |
| Ollama (local) | 4 | `qwen3-coder` |
| MiniMax | 7 | `MiniMax-M2.7` |
| OpenRouter | 3 | `openrouter/auto` |
| Mistral AI | 4 | `mistral-medium-latest` |
| Cohere | 4 | `command-a-03-2025` |
| xAI | 1 | `grok-4.5` |
| Together AI | 7 | `MiniMaxAI/MiniMax-M3` |
| Perplexity | 4 | `sonar-pro` |
| DeepInfra | 4 | `Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo` |
| Fireworks AI | 2 | `accounts/fireworks/models/gpt-oss-120b` |
| NatureCo | 3 | `natureco-default` |
| Moonshot AI | 3 | `kimi-k3` |
| Z.ai | 8 | `glm-5.1` |

Custom OpenAI-compatible URLs are also supported. Provider availability and model IDs change over time; the live provider response is authoritative.

```bash
nskuld models list
nskuld models scan
nskuld models set <model-id>
```

## Memory and completion quality

### Urðr memory

Skuld uses Urðr as its preferred durable memory engine. Recall is inserted as data rather than trusted instructions, reducing persistent prompt-injection risk. If Urðr is unavailable, coding continues with an explicit reason instead of crashing.

Memory is scoped:

- global user context under `~/.nskuld` and the configured Urðr tree;
- project context associated with the active workspace;
- resumable coding transcripts under `~/.nskuld/sessions`;
- visual scrollback kept independently from provider-context compaction.

```bash
nskuld memory status
nskuld memory search "decision"
nskuld sessions list
nskuld code --continue
```

### Quality gate and CodeDNA

When a coding turn changes files, Skuld tracks the exact paths, captures undo history, detects verification commands, and evaluates the result through its quality bridge. Protected-module findings can block completion. CodeDNA adds AI-code transparency when installed; the protected-path gate remains active when CodeDNA is absent.

Skuld does not equate “the model stopped calling tools” with “the work is verified.” Failed tests, blocked changes, tool-round limits, malformed tool arguments, and repeated empty replies are reported honestly.

## Security model

Skuld is powerful by design, so execution is constrained by default:

- **Workspace boundary:** file and command operations are resolved against the active project.
- **Sensitive-path policy:** credentials, SSH material, and secret locations are denied in safe mode.
- **Symlink escape protection:** path checks resolve links before allowing mutations.
- **Human approval:** dangerous commands, network calls, installs, and external effects require a decision.
- **Fail closed:** headless sessions cannot invent interactive approval.
- **Model cannot self-approve:** approval-like fields supplied by a model are stripped at the gate.
- **Command separation:** structured execution avoids shell parsing; explicit shell capability is treated separately.
- **Secret masking:** command output, audit output, request previews, and tool cards redact detected secrets.
- **Redirect and SSRF controls:** approved network destinations cannot silently redirect into another trust boundary.
- **Self-edit guard:** modifying Skuld's installed source is disabled unless the user explicitly enables it from a terminal.
- **Audit trail:** security-sensitive operations and failures are recorded under the user data directory.

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Telegram remote coding

Telegram remote is optional and off by default. It exists for continuing a coding session while away from the computer, with an allowlisted chat and an explicit workspace.

```bash
nskuld remote setup
nskuld remote start
nskuld remote status
nskuld remote stop
```

Remote-origin requests cannot approve protected self-edits. Keep the Telegram token private and restrict allowed chats.

## NatureCo ecosystem

Skuld integrates with the parts of the NatureCo ecosystem that support coding work:

- **NatureCo Account and Developer Portal** for optional identity and access;
- **NatureCo SDK** for ecosystem APIs;
- **Urðr** for durable tree memory;
- **CodeDNA** for post-change transparency and quality evidence;
- **Cupertino Terminal** for deep links and enhanced terminal integration, with a standard-terminal fallback;
- **ZeroLink** as an optional execution target when a paired session is available;
- **Telegram Remote** for allowlisted remote coding.

```bash
nskuld ecosystem status
nskuld ecosystem links
nskuld terminal status
```

Skuld remains usable without a NatureCo account, Cupertino Terminal, CodeDNA, or Telegram.

## Data, installation, and privacy

Run `/system` inside the coding screen or the following diagnostics to see the exact paths on the current machine:

```bash
nskuld doctor
nskuld config file
nskuld logs path
```

The directory roles are intentionally separate:

| Data | Location | Published to npm/GitHub? |
|---|---|---|
| Application package | npm global package directory | Yes, package source only |
| Personal config and provider settings | `~/.nskuld/config.json` and secure storage | No |
| Sessions, memory, logs, approvals, backups | `~/.nskuld/` | No |
| Project files | The workspace selected by the user | No |
| Project-local Skuld metadata | `<workspace>/.nskuld/` when a feature needs it | Only if the user deliberately commits it |

The npm tarball is built from the `files` allowlist in `package.json`. A developer checkout such as `C:\Projects\natureco-skuld` is never a runtime requirement for ordinary users.

## Command reference

`nskuld --help` is the authoritative, generated command list. The main surfaces are grouped below.

| Area | Commands |
|---|---|
| Coding | `code`, `acp`, `repl`, `ask`, `run`, `agent`, `agents`, `team`, `tasks`, `workboard`, `ultrareview` |
| Setup and identity | `setup`, `onboard`, `configure`, `init`, `login`, `logout`, `account`, `lang`, `completion` |
| Models and capabilities | `models`, `infer`, `capability`, `tools`, `skills`, `plugins`, `mcp`, `hooks`, `commands` |
| Source and quality | `git`, `dna`, `policy`, `exec-policy`, `approvals`, `sandbox`, `security`, `audit` |
| Memory and history | `memory`, `sessions`, `transcripts`, `backup`, `migrate` |
| Configuration and operations | `config`, `secrets`, `doctor`, `status`, `health`, `logs`, `cost`, `update`, `reset`, `uninstall` |
| Automation | `cron`, `daemon`, `gateway`, `dashboard` |
| Ecosystem and remote | `ecosystem`, `remote`, `terminal`, `system`, `directory`, `path`, `oc-path` |
| Devices and nodes | `device-pair`, `devices`, `pairing`, `node`, `nodes` |
| Content and help | `browser`, `web-fetch`, `docs`, `help` |

Examples:

```bash
nskuld doctor
nskuld tools list
nskuld skills list
nskuld mcp list
nskuld git review
nskuld backup create
nskuld security audit
nskuld completion powershell
```

## Configuration and environment

Prefer `nskuld config` for persistent settings. Environment flags are useful in CI and terminal compatibility scenarios.

| Variable | Purpose |
|---|---|
| `SKULD_LANG=tr\|en` | Interface language |
| `SKULD_CODE_MAX_TOOL_ROUNDS=<n>` | Tool-round ceiling; `0` means unlimited |
| `SKULD_CODE_SCREEN_MODE=fullscreen\|minimal` | Coding-screen mode |
| `SKULD_PLAIN_INPUT=1` | Disable the boxed composer |
| `SKULD_NO_ANIM=1` | Disable animations |
| `SKULD_NO_UPDATE_CHECK=1` | Disable update checks |
| `SKULD_TRUECOLOR=1` | Opt into 24-bit color when supported |
| `SKULD_SKILL_INDEX=names\|off` | Reduce or disable the injected skill index |
| `SKULD_AGENT_EXEC=full` | Explicitly expand agent execution policy |
| `SKULD_HAFIZA=0` | Disable the memory bridge |
| `SKULD_KALITE=0` | Disable the optional quality bridge |
| `NO_COLOR=1` / `FORCE_COLOR=0` | Disable ANSI colors |

Do not store API keys in shell history. Use the setup flow, NatureCo account flow, OS credential storage, or `nskuld secrets`.

## Update and uninstall

Update the global package:

```bash
npm install -g natureco-skuld@latest
nskuld doctor
```

Remove only the application and keep personal state for a later reinstall:

```bash
npm uninstall -g natureco-skuld
```

Preview a complete removal, including `~/.nskuld`, before deleting anything:

```bash
nskuld uninstall dry-run
nskuld uninstall run
```

`nskuld uninstall run` is destructive and asks for critical confirmation. Back up `~/.nskuld` first if its sessions or memory matter.

## System requirements

- Node.js **18 or newer**;
- Windows 10/11, current macOS, or a modern Linux distribution;
- Git for repository and worktree features;
- a provider API key, NatureCo account route, or local Ollama instance;
- a terminal with ANSI/Unicode support for the full visual experience.

Optional features have their own dependencies: browser automation needs an installed supported browser; LSP features need language servers; Cupertino and ZeroLink features need their respective NatureCo applications.

## Development

```bash
git clone https://github.com/natureco-official/natureco-skuld.git
cd natureco-skuld
npm install
npm test
npm run lint
npm run typecheck
npm run prepublishOnly
npm link
nskuld --version
```

The release gates include:

- the complete Vitest suite and integration packages;
- live local tool smoke tests using temporary workspaces, processes, HTTP loopback, file history, task, and cron lifecycles;
- manifest coverage checks for all 54 built-in coding tools;
- real provider → tool → result → final-response smoke verification;
- TypeScript workspace builds;
- execution-gateway and provenance boundaries;
- help/command consistency and design-boundary checks;
- capability, package extraction, secret, and npm audit checks;
- Windows, macOS, and Linux CI.

Before publishing:

```bash
npm run yayin
npm publish --dry-run
```

Do not publish until all local gates and the GitHub Actions matrix are green. See [docs/YAYIN-ADIMLARI.md](docs/YAYIN-ADIMLARI.md).

## Documentation

- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
- [Release procedure](docs/YAYIN-ADIMLARI.md)
- [Roadmap](docs/ROADMAP.md)
- [Architecture decisions](docs/architecture/ADR-0001-foundation.md)
- [Data boundaries](docs/architecture/ADR-0002-data-boundaries.md)
- [Cupertino contract](docs/architecture/ADR-0003-cupertino-contract.md)
- [Self-edit policy](SELF.md)

## Contributing

Bug reports and focused pull requests are welcome. Please include the operating system, Node.js version, Skuld version, reproduction steps, expected behavior, actual behavior, and relevant redacted logs.

```bash
npm test
npm run lint
npm run typecheck
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Security issues must follow [SECURITY.md](SECURITY.md), not the public issue tracker.

## License

[MIT](LICENSE) © Gencay Olgun / NatureCo.

## Acknowledgements

Skuld is informed by the interaction language and engineering lessons of [NatureCo CLI](https://github.com/natureco-official/natureco-cli), while remaining a separate coding-focused product. It also builds on the open-source ecosystems around Node.js, Git, MCP, Playwright, Urðr, Vitest, and the supported model providers.

---

**NatureCo:** [natureco.me](https://natureco.me) · **Ecosystem:** [natureco.me/ekosistem](https://natureco.me/ekosistem) · **Issues:** [GitHub Issues](https://github.com/natureco-official/natureco-skuld/issues)
