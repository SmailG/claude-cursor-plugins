# Changelog

All notable changes to this plugin will be documented here.

## 1.0.0 — initial release

- Logo: X's official mark from the X brand toolkit, on a black tile matching X's own app icon.
- Added the `x` MCP server pointing at `https://api.x.com/mcp`.
- Declared the `X_BEARER_TOKEN` plugin variable and forwarded it through the Authorization header, using X's app-only Bearer route so the server stays read-only and needs no local bridge.
