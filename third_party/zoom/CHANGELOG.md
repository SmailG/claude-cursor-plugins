# Changelog

All notable changes to this plugin will be documented here.

## 1.0.0 — initial release

- Logo: Zoom's official 180×180 apple-touch icon.
- Added the `zoom` MCP server pointing at `https://mcp.zoom.us/mcp/zoom/streamable`.
- Declared `CLIENT_ID` and `CLIENT_SECRET` plugin variables and forwarded them through MCP auth, since Zoom requires manual OAuth client registration.
