# Security policy

## Supported versions

Skuld has not reached `1.0` yet. Security fixes are applied to the latest published `0.1.x` release and the current `main` branch.

| Version | Support |
|---|---|
| Latest `0.1.x` | Active security support |
| Older pre-release builds | Upgrade required |

## Reporting a vulnerability

Please do **not** open a public issue for a suspected vulnerability.

Email **security@natureco.me** with:

- a concise description;
- affected Skuld version and operating system;
- reproducible steps or a minimal proof of concept;
- potential impact;
- suggested mitigation, if known.

Remove API keys, access tokens, personal paths, and private repository content from reports and logs. We aim to acknowledge complete reports within 48 hours.

## Security expectations

- Keep Skuld, Node.js, Git, and provider SDKs current.
- Store credentials through setup, OS credential storage, NatureCo account login, or `nskuld secrets`; never commit them.
- Review approval prompts, including the exact command, workspace, network destination, and reason.
- Run `nskuld security audit`, `nskuld doctor`, and `npm audit` before publishing or deploying.
- Keep Telegram remote disabled unless it is needed; use an allowlisted chat and a dedicated workspace.
- Do not enable `SKULD_AGENT_EXEC=full` or self-editing globally without understanding the expanded authority.

Skuld's design boundaries are described in [ADR-0002](docs/architecture/ADR-0002-data-boundaries.md) and [SELF.md](SELF.md).
