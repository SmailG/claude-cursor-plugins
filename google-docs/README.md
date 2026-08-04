# Google Docs

Cursor plugin that connects agents to [Google Docs](https://docs.google.com) through Google's remote [Model Context Protocol](https://modelcontextprotocol.io/) server.

Read Google Docs and apply updates in the signed-in Workspace account.

## Install

1. Open **Cursor Settings → Plugins**.
2. Search for **Google Docs**.
3. Click **Install**, then complete the Google sign-in prompt.

Or run `/add-plugin google-docs` in chat.

## MCP

```json
{
  "mcpServers": {
    "google-docs": {
      "type": "http",
      "url": "https://docsmcp.googleapis.com/mcp/v1"
    }
  }
}
```

Auth is OAuth 2.0 against Google. Cursor prompts for Google sign-in when the plugin connects.

## Docs

- Google MCP setup: https://developers.google.com/workspace/docs/api/guides/configure-mcp-server
- Workspace MCP overview: https://developers.google.com/workspace/guides/configure-mcp-servers

Logo is the official Google Docs product icon, placed on a white tile with padding so it reads well in the Cursor UI:
https://www.gstatic.com/images/branding/productlogos/docs_2026/v1/192px.svg

## License

MIT
