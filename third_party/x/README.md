# X

Cursor plugin that connects agents to the [X API](https://docs.x.com) through X's official hosted [Model Context Protocol](https://modelcontextprotocol.io/) server at `https://api.x.com/mcp`.

This plugin uses X's **app-only Bearer** route, which is read-only: agents can search and read public X data, but cannot post, bookmark, publish Articles, or act as any user.

## Install

1. Open **Cursor Settings → Plugins**.
2. Search for **X**.
3. Click **Install**, then set your app-only Bearer token (below).

Or run `/add-plugin x` in chat.

## MCP

```json
{
  "mcpServers": {
    "x": {
      "type": "http",
      "url": "https://api.x.com/mcp",
      "headers": {
        "Authorization": "Bearer ${X_BEARER_TOKEN}"
      }
    }
  }
}
```

## What agents can do

| Category | Read-only capabilities |
| --- | --- |
| Posts | Fetch posts, see likers / reposters / quoters, recent counts |
| Search | Full-archive post search, user search, news search |
| Users | Look up users by id or handle; read a user's posts, timeline, and mentions |
| News & trends | Get news stories, get trends for a location (WOEID) |

Write tools and user-context tools (bookmarks, Articles, resolving the current user) are not reachable with an app-only token. See [Full user-context access](#full-user-context-access) if you need them.

## Setup

No credential ships with this plugin — it carries only a `${X_BEARER_TOKEN}` placeholder, and each install supplies its own token.

1. Create an app in the [X Developer Portal](https://developer.x.com).
2. Open the app's **Keys and tokens** page and copy the **Bearer Token** (the app-only token).
3. In **Dashboard → Plugins → Configure**, set **X app-only Bearer token** to that value.

The token carries your app's own quota and rate limits rather than a user's. Rotate or regenerate it from the developer portal if it is ever exposed.

On a team marketplace an admin sets the token once for everyone, so every member's tool calls share that app's rate limits.

## Full user-context access

X's other route runs the open-source [`xurl`](https://github.com/xdevplatform/xurl) bridge locally over stdio. It performs an OAuth 2.0 PKCE browser login, refreshes tokens automatically, and unlocks writes and user-context tools:

```json
{
  "mcpServers": {
    "x": {
      "command": "npx",
      "args": ["-y", "@xdevplatform/xurl", "mcp", "https://api.x.com/mcp"],
      "env": {
        "CLIENT_ID": "YOUR_X_APP_CLIENT_ID",
        "CLIENT_SECRET": "YOUR_X_APP_CLIENT_SECRET"
      }
    }
  }
}
```

That route needs OAuth 2.0 enabled on the app, `http://localhost:8080/callback` registered as a redirect URI, Node.js for `npx`, and a reachable browser for the first login — so it is deliberately not what this plugin ships.

## X documentation search

X also hosts an unauthenticated MCP server for its developer docs. Add it alongside this plugin if you want agents to look up endpoint details while they work:

```json
{
  "mcpServers": {
    "x-docs": {
      "url": "https://docs.x.com/mcp"
    }
  }
}
```

## Docs

- MCP servers for the X API: https://docs.x.com/tools/mcp
- Authentication overview: https://docs.x.com/fundamentals/authentication/overview
- X API v2 OpenAPI spec: https://api.x.com/2/openapi.json

Logo is X's official mark from the [X brand toolkit](https://about.x.com/en/who-we-are/brand-toolkit), placed on a black tile matching X's own app icon.

## License

MIT
