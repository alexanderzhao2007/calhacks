# tot social train (SpacetimeDB)

Opt-in social layer: each group shares one train. Answering tot's question instead of skipping earns miles that move it toward the group's weekly goal. The train resets every Monday (local time). The member with the most miles today is the conductor 🎩. There is no full ranking.

**Stores only:** display name, group (name, code, goal), membership, and per-day counts. It never stores prompts, answers, or subjects. Skips are not recorded.

**Privacy model:** all tables are private. Clients read only through per-user views:

| View | Returns |
|---|---|
| `my_profile` | your display name ("Maya R.") |
| `my_look` | your character: first and last name, bulb color |
| `my_solo` | your weekly goal when riding solo |
| `my_counts` | your days: prompts, questions, answers, miles |
| `my_group` | your group (one group per person, max 8 members) |
| `group_members` | names of everyone in your group |
| `group_looks` | everyone's character and join time (bulbs show in join order; hat ties go to the earlier joiner) |
| `group_counts` | your group's **answers and miles** per day. Prompt and question counts are never shared |

## Popup flow (from the "tot popup" design)

Home → **About you** (`set_profile`: first/last name and one of 8 bulb colors; this is the opt-in, and the token is saved only after it succeeds) → one of:

- **Start your train** (`create_group`, goals 50/100/200/other) → Invite (group code) → train
- **Climb aboard** (`join_group` with a 6-character code) → train
- **Solo** (`set_solo_goal`, goals 30/50/100/other) → solo train; "Bring friends aboard" starts a group later

The train view, menu (code, edit character, change goal, leave group, delete data) and the once-a-week arrival animation are all client-side (`extension/ui/TrainPopup.tsx`). Which arrivals were already shown is kept in `chrome.storage.local` (`totArrivalsSeen`).

The `look`, `member_since` and `solo_goal` tables were added after the first Maincloud publish. Adding tables is an automatic migration, so publishing this version keeps all existing data (no `--delete-data`). People who joined before it show initials from their display name and the default teal color until they edit their character.

## What gets counted

One `daily_count` row per person per local day:

| Column | Incremented when | Reducer |
|---|---|---|
| `prompts` | you send a message on Claude (tot's own follow-ups excluded) | `record_prompt(day)` |
| `questions` | tot asks you a question (follow-up rounds not counted) | `record_question(day)` |
| `answers` | you answer instead of skipping, or your message already showed an attempt | `record_thought_first(day, tier)` |
| `miles` | same call; set **in the module** from the tier, capped at 300/day | |

| Tier | When | Miles |
|---|---|---|
| 3 | thought first: the message already showed an attempt, so tot never asked (classifier `allow` + `effort`) | 12 |
| 0 | real thinking on the first answer (or our judge failed) | 10 |
| 1 | real thinking after one follow-up | 6 |
| 2 | follow-up cap or time window reached without real thinking | 1 |

Wrong answers earn full miles: the judge checks for thinking, not correctness.

## Nothing is being recorded?

Recording only starts after you **join in the toolbar popup**. Joining saves the token that the background worker needs.

1. **Toolbar badge.** If the tot icon shows **Join**, you haven't joined in this browser profile.
2. **Same browser profile.** `npm run dev` doesn't open a browser (`webExt.disabled` in `extension/wxt.config.ts`). Load `extension/.output/chrome-mv3-dev` unpacked in your normal Chrome (`chrome://extensions` → Developer mode → Load unpacked), then join from the popup in that same Chrome profile.
3. **Same server.** Tokens are per server (`TOKEN_KEY` in `extension/core/social.ts`). Joining on a local server doesn't count for Maincloud.
4. **Service-worker console.** In `chrome://extensions`, open tot's "service worker" console. Each event logs `[tot] friends: record_prompt recorded`, `… not joined, skipping`, or `… failed: <reason>`.
5. **Server side.** Run `spacetime logs tot --server maincloud` (reducer errors) and `spacetime sql tot --server maincloud "SELECT * FROM daily_count"`.

## Where it runs

The extension talks to Maincloud by default (database `tot`, dashboard: https://spacetimedb.com/tot). After changing the module:

```sh
npm run publish:cloud -w db   # needs `spacetime login` as the database owner
npm run db:generate           # regenerate extension/stdb bindings after schema changes
```

Breaking schema changes (removing or adding columns) can't auto-migrate. To wipe the data and republish, run this from `db/`:
`spacetime publish tot --server maincloud --delete-data=on-conflict --yes`.

## Run locally (optional)

Install the CLI once: `curl -sSf https://install.spacetimedb.com | sh`, then add `~/.local/bin` to `PATH`.

```sh
npm run db:start      # local server on 127.0.0.1:3100 (keep running)
npm run db:publish    # publish/update the module there as database "tot"
WXT_TOT_STDB_URI=http://127.0.0.1:3100 npm run dev   # point the extension at it
```

## How the extension uses it

- **Popup** (`extension/ui/TrainPopup.tsx`). On first use you set a name, then start a group or join one with its code. Joining is the opt-in; only then is the token saved to `chrome.storage.local`.
- **Content script.** It sends counts only, never text: `tot:prompt` on send, `tot:question` when tot asks, and `tot:thoughtFirst { tier }` from the coordinator's `earnMiles` effect. The background worker calls the reducers over HTTP. With no token it does nothing, and failures never touch the Claude flow.
- **Why the popup uses HTTP, not the SDK.** The popup reads the views over HTTP (`/sql` with the student's token) and refreshes every 3 s. It can't use the `spacetimedb` SDK: the SDK builds decoders with `Function(...)`, which MV3 extension pages block (`unsafe-eval`), and the popup rendered blank. See `extension/core/friendsApi.ts`.
- **Generated bindings.** The bindings in `extension/stdb/` are kept in sync for reference but are not imported by the extension.
