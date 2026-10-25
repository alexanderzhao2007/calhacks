// Toolbar popup: the opt-in friends board, backed by SpacetimeDB.

import { createRoot } from 'react-dom/client';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { DbConnection } from '../../stdb';
import { STDB_DB, STDB_URI, TOKEN_KEY } from '../../core/social';
import { FriendsPopup } from '../../ui/FriendsPopup';
import '../../ui/friends.css';

async function main() {
  // A stored token means the student already joined; reuse their identity.
  // Before joining, each open gets a throwaway identity and nothing is saved.
  const { [TOKEN_KEY]: token } = (await browser.storage.local.get(TOKEN_KEY)) as Record<string, string | undefined>;
  const builder = DbConnection.builder().withUri(STDB_URI).withDatabaseName(STDB_DB).withToken(token);
  createRoot(document.getElementById('root')!).render(
    <SpacetimeDBProvider connectionBuilder={builder}>
      <FriendsPopup />
    </SpacetimeDBProvider>,
  );
}

void main();
