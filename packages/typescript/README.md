# @scopeveil/sdk

Privacy-first cost & latency observability for LLM apps.

The SDK wraps your existing OpenAI / Anthropic clients and ships only metadata.
**Prompt content, completion text, system prompts and raw user IDs never
leave your process.** Audit the source on GitHub if you don't believe us.

## Install

```bash
npm install @scopeveil/sdk
```

## Quick start

```ts
import OpenAI from 'openai';
import { ScopeVeil } from '@scopeveil/sdk';

const monitor = new ScopeVeil({
  apiKey: process.env.SCOPEVEIL_KEY!,
  endpoint: 'https://ingest.scopeveil.com', // or your self-hosted ingest URL
});

const openai = monitor.wrapOpenAI(new OpenAI());

const completion = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello' }],
  // Optional context, never sent as prompt content, only metadata
  // @ts-ignore - extension keys
  scopeveil_tag: 'pdf-summarizer',
});

// Force flush before the process exits
process.on('SIGTERM', async () => { await monitor.flush(); });
```

Anthropic works the same way:

```ts
import Anthropic from '@anthropic-ai/sdk';

const anthropic = monitor.wrapAnthropic(new Anthropic());
await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello' }],
  // @ts-ignore
  scopeveil_tag: 'chat-bot',
});
```

## What is captured (and only this)

| field           | example                          |
| --------------- | -------------------------------- |
| `provider`      | `"anthropic"`                    |
| `model`         | `"claude-sonnet-4-6"`            |
| `input_tokens`  | `1842`                           |
| `output_tokens` | `340`                            |
| `cache_tokens`  | `1200`                           |
| `latency_ms`    | `1240`                           |
| `feature_tag`   | `"pdf-summarizer"`               |
| `user_id_hash`  | sha256(your user id), never raw  |
| `timestamp`     | ISO-8601 UTC                     |

> Note: the SDK does not report `cost_usd`. Cost is computed by the ScopeVeil
> backend from raw token counts using a versioned pricing table. This keeps
> the SDK auditable (no business logic, no embedded price tables) and allows
> the platform to update prices, apply per-customer rates, or recompute
> historical events without an SDK release.

## What is NEVER captured

- prompt content
- completion text
- system prompts
- function call arguments
- raw user identifiers (only sha256 is accepted)

This is enforced by:
1. The SDK's allowlist sanitizer: drops any unknown field before transport.
2. The ingest API's `Zod.strict()` schema: rejects events containing any
   field outside the allowlist, even if the SDK is bypassed.

## Privacy is tested

`tests/privacy.test.ts` runs on every commit and fails the build if any
prompt-shaped string makes it into the transport payload.

## License

MIT. See [LICENSE](./LICENSE).
