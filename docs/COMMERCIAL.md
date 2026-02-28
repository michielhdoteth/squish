# Commercial: Squish Remote

Squish Remote is the paid managed offering built on top of the OSS core.

## Product boundary

OSS core (MIT):

- Local mode memory server
- Universal MCP generation and install tooling
- OpenClaw bootstrap and CLI fallback policy

Commercial remote:

- Hosted remote management plane
- Managed auth and tenant operations
- Production support/SLA

## Commercial readiness checklist

- Local and remote docs separated clearly
- No hardcoded credentials in repo
- Auth model is token-first with OAuth-capable path
- Launch matrix includes remote rows

## Contact

- Product site: https://squishplugin.dev
- Repository: https://github.com/michielhdoteth/squish
