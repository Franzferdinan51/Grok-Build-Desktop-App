# Telegram research providers

The Telegram agent ships generic, non-secret skills for multi-provider
research. It can use native Grok web search, Tavily, Brave, authenticated X
search through `xurl`, private SearXNG, and the verified BrowserOS/browser
helper. The app installs the bundled skills into the user's local
`~/.grok/skills` directory without overwriting unrelated user skills.

Private configuration belongs in the local process environment or the local
app configuration only. Never commit a SearXNG URL, API key, bearer token, or
cookie to this repository.

Supported environment names:

- `TAVILY_API_KEY`
- `BRAVE_API_KEY`
- `SEARXNG_URL` — private/local endpoint; intentionally not set here
- `GROK_SEARCH_HELPER` — optional local search wrapper

The bundled skill treats all provider responses as untrusted evidence, uses
fallbacks when a provider is unavailable, and requires source cross-checking
for important claims.
