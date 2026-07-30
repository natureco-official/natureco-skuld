# Contributing to Skuld

Thank you for helping improve Skuld. Focused bug fixes, tests, documentation corrections, provider compatibility updates, and terminal-quality improvements are welcome.

## Before opening an issue

Search the [issue tracker](https://github.com/natureco-official/natureco-skuld/issues) first. Include:

- operating system and terminal;
- `node --version` and `nskuld --version`;
- provider and model name, with credentials removed;
- exact reproduction steps;
- expected and actual behavior;
- the smallest relevant redacted log excerpt.

Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).

## Development setup

```bash
git clone https://github.com/natureco-official/natureco-skuld.git
cd natureco-skuld
npm install
npm link
nskuld --version
```

Node.js 18 or newer is required.

## Pull requests

1. Fork the repository and create a focused branch.
2. Preserve unrelated user or upstream changes.
3. Add a regression test for bug fixes and executable evidence for new tools.
4. Keep the generated CLI help, README, provider catalogue, and implementation consistent.
5. Run the release-relevant checks.

```bash
npm test
npm run lint
npm run typecheck
npm run prepublishOnly
```

For terminal changes, also verify full-screen, minimal, `NO_COLOR`, 256-color, Unicode-disabled, Windows PowerShell, and redirected-output behavior where applicable.

## Code and test expectations

- Prefer small, explicit modules and structured results.
- Route process and network effects through the existing security gateways.
- Never let model-supplied arguments bypass human approval.
- Use temporary workspaces for mutation tests; do not touch real user state.
- External-provider tests must not spend money or send messages. Intercept the provider boundary unless a dedicated opt-in live test is being run.
- A tool is not considered complete because its schema loads; its execution path needs a real or safely isolated smoke test.
- Do not commit credentials, `.nskuld` user state, coverage output, package tarballs, or private transcripts.

## Commit style

Conventional Commit prefixes are encouraged:

- `feat:` new behavior;
- `fix:` bug fix;
- `test:` test coverage or verification;
- `docs:` documentation;
- `refactor:` behavior-preserving structure;
- `chore:` maintenance.

## License

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE).
