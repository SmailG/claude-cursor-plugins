---
name: X MCP guide
description: >-
  ALWAYS read this before using any X connection, X MCP, or X plugin, and again
  on any X error. Do not call an X tool until this file has been read in the
  current turn.
---
# X MCP guide

This plugin uses **X MCP**. The user taps Connect and signs in with X. They are not setting up an API app.

Probe the current user before search, timeline, bookmarks, or news. On a core error, stop. Name the simple issue, then the next step. Do not explain enrollment mechanics, billing internals, Connected vs enrolled, or pay-per-use. Never retry 401 / 403-enrollment / credits-blocked unchanged. Never ask for keys. Never tell them to create an app, Project, or Production env.

## The three errors

Match `type`, `reason`, `title`, `detail`. Then say the quoted line. Nothing else.

### 1. Sign-in failed

**When:** X tools unavailable; connect prompt; 401; Unauthorized; login loop; token refresh failed.

**Say:**

> You're not signed in to X. Reconnect the X plugin in this chat. Don't paste keys or passwords. Then I'll retry.

Trigger reconnect if you can. Probe once after. If it still 401s, stop.

### 2. Not onboarded (403)

**When:** `client-forbidden`; `user-not-enrolled`; `client-not-enrolled`; Client Forbidden; 403 on timeline / mentions / search / bookmarks after Connect.

**Say:**

> This X account isn't set up yet. Go to https://console.x.com, register and onboard with this same X account, then come back and I'll retry.

Do not retry. Do not search. Do not mention apps, projects, or pay-per-use. If they already did that, ask them to reconnect, probe once, and if it still 403s say the same line again.

### 3. Out of credits

**When:** no credits; balance zero or negative; “does not have any credits”; requests blocked until credits are added.

**Say:**

> You're out of credits. Go to https://console.x.com and add credits, then I'll retry.

Stop. Do not retry.

If the payload is only `usage-capped` (no enrollment reason):

> You hit a limit. Try again later.

If `user-not-enrolled` or `client-not-enrolled` is present, that is #2, not this.

## Other errors

`not-authorized-for-resource` (private account they don't own): stop. Their own timeline/bookmarks: probe current user, retry once with that id.

> I can't open that. If it's yours, reconnect X. If it's someone else's private account, I don't have access.

`resource-not-found`: resolve the id, retry **once**. Never retry the same id.

> Paste a handle, profile link, or post link.


| They asked                    | You do                             | Else ask              |
| ----------------------------- | ---------------------------------- | --------------------- |
| `@handle` posts               | User search; one match → that `id` | Paste the profile.    |
| A post                        | Parse `/status/{id}`               | Paste the post link.  |
| Bookmarks, timeline, mentions | Current user → that `id`           | Reconnect X.          |
| Bookmark folder               | List folders on `{me}`             | Which folder?         |
| News                          | News search                        | What topic?           |
| Search                        | Rewrite query                      | What should I search? |


429 `rate-limit-exceeded`: wait for `x-rate-limit-reset`, smaller page, retry once.

> I'll retry in a minute.

400 `invalid-request`: fix params, don't retry unchanged.

5xx: backoff. Check [https://developer.x.com/status](https://developer.x.com/status) if it keeps failing.

200 + `errors[]`: use `data`, skip listed ids.

## Session start

Resolve the current user (`user.fields=id,name,username,description,public_metrics`).


| Result           | Next                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------ |
| Success          | Cache `id` as `{me}`. Do their ask. Prefer `{me}` for timeline, mentions, bookmarks. |
| Error 1, 2, or 3 | Stop. Say that error's line. Do not search.                                          |
| 200 + `errors[]` | Keep `data`.                                                                         |




## Fields, pagination, cost

Request fields. If the tool takes `tweet.fields` or `post.fields`, send `created_at,public_metrics,author_id,lang,conversation_id`. Also `user.fields=created_at,description,public_metrics,verified,location` and `expansions=author_id,referenced_tweets.id`.

`meta.next_token` → `pagination_token`. Stop when `next_token` is omitted.

Reads bill per resource. Prefer recent counts, then `{me}` reads, then a small full-archive page. Recent window is 7 days.

## Search operators

```text
from:handle
to:handle
@handle
#tag
"exact phrase"
url:example.com
lang:en
-is:retweet
-is:reply
is:verified
has:images
has:video_link
has:links
conversation_id:ID
```

Spaces = AND. Recent query max 512 characters; full-archive 1,024. Use `min_likes:` / `min_reposts:`, not `min_faves:` / `min_retweets:`.

## Workflows

Current user first. Stop on errors 1–3.

- Home / mentions / my posts: `{me}`, modest `max_results`. Paginate only if asked.
- Handle: username → posts. Else user search, then ask.
- Topic: recent counts → small search page → stop.
- Bookmarks: list `{me}`. Save: parse status id, create bookmark.
- One post: parse status id, lookup.



## Don't

- Explain deep details (pay-per-use, Connected vs enrolled, billing internals). Do name the simple issue.
- Say pay-per-use, Project, Production, or "create an app".
- Ask for secrets.
- Retry 403 or credits-blocked in a loop.

