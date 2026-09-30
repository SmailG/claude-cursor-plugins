# Changelog

All notable changes to this plugin will be documented here.

## 1.0.1 — hosted placement

- Declares `"placement": "server"` on the MCP server so Grok Bot (desktop and mobile) dials it through the hosted MCP path. Without it the row stays UNDECIDED and never shows a connect / sign-in card in Grok Bot.

## 1.0.0 — initial release

- Added the `etoro-trading` MCP server pointing at eToro's hosted Streamable HTTP endpoint for the Public API (`https://mcp.public-api.etoro.com`).
- Auth uses OAuth with eToro user login (PKCE, dynamic client registration) — no API key or client ID to configure.
- Logo: eToro's official bull mark, from the logo eToro publishes for its Cursor marketplace listing, on a 192×192 tile.
