# Obsidian Jira Plugin

A personal Obsidian plugin that surfaces your assigned Jira issues in a sidebar grouped by project, lets you transition them with a click, and exposes ticket-level actions — comments, attachments, links, subtasks, time logging — without leaving the editor.

Built for a single user on a single machine. Not intended for community distribution as-is; the plugin id and styling are project-specific.

## Features

- **Per-project lanes** — configurable; maps project keys (e.g. `PROD`, `SL`) to display names.
- **One-click transitions** — clicking a row checkbox transitions the Jira ticket to Done (or back to In Progress / To Do).
- **Row menu** — assign to me, set due date, set priority, add/remove label, add comment, log work, attach file, add remote link.
- **Expandable rows** — Acceptance Criteria (read-only), linked URLs, attached files, subtasks (create + tick), description preview.
- **Interrupt capture** — "+ Add interrupt" creates an `adhoc`-labelled Jira ticket assigned to you.
- **New task creation** — "+ Create task" opens a Story/Bug/Spike modal, auto-assigns to you, optional add-to-current-sprint.
- **Clickable lane headers** → project board URL in browser.
- **Clickable task keys** → canonical ticket URL in browser.
- **Automatic ADF → markdown conversion** for description fields (including AC extraction from Jira's rich-text format).

## Install

```bash
git clone https://github.com/ywy929/obsidian-jira-plugin.git
cd obsidian-jira-plugin
npm install
npm run build
```

Copy the three release files into your vault's plugins folder:

```
<vault>/.obsidian/plugins/daily-workflow/
├── main.js
├── manifest.json
└── styles.css
```

Enable **Daily Workflow** in Obsidian → Settings → Community plugins, then fill in Settings:

- **Jira base URL** — e.g. `yourteam.atlassian.net` (no `https://`, no trailing slash)
- **Email** — your Atlassian account email
- **API token** — generate at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
- **Project keys** — comma-separated, e.g. `PROD, SL`

Click **Verify** — expect a toast with your display name. `selfAccountId` is cached in the plugin's `data.json` after that.

The view does not auto-open. Trigger it from the command palette: **Open Daily Workflow**.

## Development

```bash
npm run dev     # watch mode
npm test        # Jest suite (Jira-only)
npm run build   # production bundle to main.js
```

## Non-obvious implementation notes

### XSRF workaround for Obsidian → Atlassian POSTs

Obsidian's `requestUrl` sends browser-like headers that trip Atlassian Cloud's XSRF filter on state-changing requests, even when `X-Atlassian-Token: no-check` is set. Three mitigations stacked together in `src/jira/JiraClient.ts#request`:

1. `User-Agent: Obsidian.md` — the default (browser-like) UA triggers XSRF on POST.
2. `Origin: https://<jira-host>` — same-origin claim bypasses cross-site check.
3. `X-Atlassian-Token: no-check` via **computed property key** (`[tokenHeaderKey]: 'no-check'`). Obsidian's `requestUrl` is known to filter this header when passed as a string literal; a dynamically-keyed object transmits it correctly.

All three are required; removing any one surfaces a 403 with body `"XSRF check failed"`.

### Search endpoint

Uses `GET /rest/api/3/search/jql` (the [enhanced endpoint](https://developer.atlassian.com/changelog/#CHANGE-2046) introduced 2024). The legacy `GET /rest/api/3/search` is 410 Gone. `POST /rest/api/3/search/jql` triggers XSRF in Obsidian even with the workaround above; GET does not.

### Description handling

Jira's REST v3 returns `description` as ADF (Atlassian Document Format) JSON, not plain text. `src/jira/adf.ts` converts it to markdown-enough text so the existing AC regex and the description preview both work.

## History

v0.2.0 dropped the daily-note workflow (auto-create today's note, roll-forward, seed-from-tasks-on-hand, append-interrupt-to-note). The view is now Jira-only and no longer touches the vault filesystem.

## Limitations

- Desktop-only (uses Node-side filesystem API for plugin loading).
- No team distribution or localisation; strings and lane mappings are hardcoded for the author's setup.
- No real-time push updates from Jira. Refresh is manual or on view open.
- Attachment downloads open in the browser and require the user to be logged into Jira there.

## Licence

No licence declared. All rights reserved by the author; not intended for reuse without permission.
