# Apollo.io

Cursor plugin that connects agents to [Apollo.io](https://www.apollo.io) through Apollo's official remote [Model Context Protocol](https://modelcontextprotocol.io/) server.

Search Apollo's contact and company database, enrich records, manage contacts and lists, work with sequences and tasks, and send one-off emails from the signed-in Apollo workspace.

This is Apollo.io the sales intelligence platform — not [Apollo GraphOS](https://www.apollographql.com/docs/apollo-mcp-server), which ships an unrelated self-hosted MCP server for GraphQL APIs.

## Install

1. Open **Cursor Settings → Plugins**.
2. Search for **Apollo.io**.
3. Click **Install**, then complete the Apollo sign-in prompt.

Or run `/add-plugin apollo-io` in chat.

## MCP

```json
{
  "mcpServers": {
    "apollo-io": {
      "type": "http",
      "url": "https://mcp.apollo.io/mcp"
    }
  }
}
```

Auth is OAuth 2.0 against Apollo. Cursor prompts for Apollo sign-in when the plugin connects — there is no API key to configure.

## Before you connect

Apollo prohibits AI model training on data accessed through Apollo MCP. Turn model training off in your Cursor privacy settings before connecting.

You also need an active Apollo account with access to the records you want the agent to use, plus available credits for enrichment and other credit-consuming actions.

## Notes

- Tool calls run as the Apollo user who authorizes the connection and cannot exceed that user's permissions.
- People search returns profile data only; use an enrichment action to retrieve emails and phone numbers. Enrichment consumes credits.
- Revoke access at any time from Apollo's connected apps settings.

## Docs

- Apollo MCP setup: https://docs.apollo.io/docs/apollo-mcp
- Enrichment overview: https://knowledge.apollo.io/hc/en-us/articles/33699917233293-Enrichment-Overview

Logo is Apollo.io's brand mark on the brand yellow tile, sized to match the other third-party plugin logos.

## License

MIT
