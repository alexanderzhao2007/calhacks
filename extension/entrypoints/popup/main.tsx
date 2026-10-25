// Toolbar popup: the opt-in social train, backed by SpacetimeDB over HTTP
// (see core/friendsApi.ts for why not the SDK).

import { createRoot } from 'react-dom/client';
import { TrainPopup } from '../../ui/TrainPopup';
import '../../ui/train.css';

createRoot(document.getElementById('root')!).render(<TrainPopup />);
