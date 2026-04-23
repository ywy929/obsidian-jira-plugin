# Obsidian Jira Plugin

A personal Obsidian plugin that bridges a Jira Cloud instance with a daily-note workflow. Pulls your assigned issues into a sidebar grouped by project, lets you check them off (which transitions them in Jira), and integrates ticket-level actions — comments, attachments, links, subtasks, time logging — without leaving the editor.

Built for a single user on a single machine. Not intended for community distribution as-is; the plugin id and styling are project-specific.

## Features

- **Morning roll-forward** — pulls yesterday's unfinished `[ ]` items into today's daily note under the same lane.
- **Real-time check-off** — clicking a checkbox writes `[x]` to the markdown *and* transitions the Jira ticket to Done. Failures roll back.
- **Per-project lanes** — configurable; maps project keys (e.g. `PROD`, `SL`) to display names.
- **Row menu** — assign to me, set due date, set priority, add/remove label, add comment, log work, attach file, add remote link.
- **Expandable rows** — Acceptance Criteria (read-only), linked URLs, attached files, subtasks (create + tick), description preview.
- **Interrupt capture** — "+ Add interrupt" creates an `adhoc`-labelled Jira ticket and appends a line under `## Interrupts (#adhoc)` in today's daily note.
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
- **Daily folder path** — vault-relative, e.g. `daily`

Click **Verify** — expect a toast with your display name. `selfAccountId` is cached in the plugin's `data.json` after that.

## Development

```bash
npm run dev     # watch mode
npm test        # Jest suite (54 tests)
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

### `DailyNoteSync` is long-lived

`main.ts` constructs one `DailyNoteSync` instance on plugin load and exposes it via `getDailyNoteSync()`. Earlier versions rebuilt it per call, which discarded the in-memory `lastKnownMtime` map and silently disabled external-edit conflict detection.

## Limitations

- Desktop-only (uses Node-side filesystem API).
- No team distribution or localisation; strings and lane mappings are hardcoded for the author's setup.
- No real-time push updates from Jira. Refresh is manual or on plugin open.
- Attachment downloads open in the browser and require the user to be logged into Jira there.

## Licence

No licence declared. All rights reserved by the author; not intended for reuse without permission.
