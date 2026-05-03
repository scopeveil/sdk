# scopeveil-sdk (Python)

> Status: scaffolding only. The TypeScript SDK is the reference implementation;
> Python ships next.

The Python SDK will mirror the TypeScript design exactly — wrap an existing
OpenAI / Anthropic client, capture only metadata (model, tokens, latency,
feature tag, hashed user id, cost), and ship to the ingest endpoint
fire-and-forget. Prompt content never leaves the process.

```bash
pip install scopeveil-sdk
```

```python
from openai import OpenAI
from scopeveil import ScopeVeil

monitor = ScopeVeil(api_key=os.environ["SCOPEVEIL_KEY"])
openai = monitor.wrap_openai(OpenAI())

response = openai.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello"}],
    extra_body={"scopeveil_tag": "pdf-summarizer"},
)
```

The privacy guarantees and pricing table are shared with the TypeScript SDK
— see `../typescript/` for the reference implementation and tests.
