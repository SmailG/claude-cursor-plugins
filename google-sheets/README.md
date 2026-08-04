# Google Sheets

Cursor plugin that connects agents to [Google Sheets](https://sheets.google.com) through Google's remote [Model Context Protocol](https://modelcontextprotocol.io/) server.

Read spreadsheet values, update cells and formulas, and copy sheets between spreadsheets.

## Install

1. Open **Cursor Settings → Plugins**.
2. Search for **Google Sheets**.
3. Click **Install**, then complete the Google sign-in prompt.

Or run `/add-plugin google-sheets` in chat.

## MCP

```json
{
  "mcpServers": {
    "google-sheets": {
      "type": "http",
      "url": "https://sheetsmcp.googleapis.com/mcp/v1"
    }
  }
}
```

Auth is OAuth 2.0 against Google. Cursor prompts for Google sign-in when the plugin connects.

## Docs

- Google MCP setup: https://developers.google.com/workspace/sheets/api/guides/configure-mcp-server
- Workspace MCP overview: https://developers.google.com/workspace/guides/configure-mcp-servers

Logo is the official Google Sheets product icon, placed on a white tile with padding so it reads well in the Cursor UI:
https://www.gstatic.com/images/branding/productlogos/sheets_2026/v1/192px.svg

## License

MIT
