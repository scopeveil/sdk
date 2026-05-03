# ScopeVeil SDK

Open-source SDKs for [ScopeVeil](https://scopeveil.com) — privacy-first cost &
latency observability for LLM apps.

| Language    | Package         | Status      |
| ----------- | --------------- | ----------- |
| TypeScript  | `@scopeveil/sdk` (npm)     | beta — see [`packages/typescript`](./packages/typescript) |
| Python      | `scopeveil-sdk` (PyPI)     | scaffolding — see [`packages/python`](./packages/python) |

## Why open source?

Anyone running an LLM in production has to trust that the observability
vendor isn't reading the prompts. The most credible answer is _make the
collection layer auditable_ — so the SDK is open source and the privacy
guarantees are enforced by automated tests.

If you find a way to leak prompt content through the SDK, please open an
issue (and we'll buy you a coffee).

## License

MIT — see [LICENSE](./LICENSE).
