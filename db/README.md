# tot friends board (SpacetimeDB)

Opt-in social layer: friends compare streaks of answering tot's question instead of skipping.

**Stores only:** display name, friend code, mutual friendships, per-day counts. Never prompts, answers or subjects. Skips are not recorded.

**Privacy model:** all tables are private. Clients read through per-user views (`my_profile`, `friend_profiles`, `board_counts`) that return only the caller and their mutual friends.

## Run locally

Install the CLI once: `curl -sSf https://install.spacetimedb.com | sh`, then add `~/.local/bin` to `PATH`.

```sh
npm run db:start      # local server on 127.0.0.1:3100 (keep running)
npm run db:publish    # publish/update the module as database "tot"
npm run db:generate   # regenerate extension/stdb bindings after schema changes
```

## Flow

- Toolbar popup (`extension/entrypoints/popup`): Join sets a display name. This is the opt-in, and only then is the SpacetimeDB token saved to `chrome.storage.local`.
- When the student answers tot's question (`showThanks`), the background worker calls `record_thought_first` over HTTP. With no token it does nothing; failures are ignored and never touch the Claude flow.
- The popup subscribes to the views, so a friend's count updates live.

## Deploy

`npm run publish:cloud -w db` publishes to Maincloud (needs `spacetime login`). Then build the extension with `WXT_TOT_STDB_URI=https://maincloud.spacetimedb.com`.
