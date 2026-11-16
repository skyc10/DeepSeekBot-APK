import { useSyncExternalStore } from 'react';

import { appearanceStore, type AppearanceSnapshot } from './appearance-store';

/** Subscribe to the process-wide appearance store. Restoration into this store happens once,
 * at startup, in native-interface-preferences (the app's native-preferences restore point). */
export function useAppearance(): AppearanceSnapshot {
  return useSyncExternalStore(
    appearanceStore.subscribe,
    appearanceStore.getSnapshot,
    appearanceStore.getSnapshot,
  );
}

export {
  appearanceFile,
  parseAppearanceDocument,
  type AppearanceDocument,
} from './appearance-document';
export {
  appearanceStore,
  documentScheme,
  type AppearanceSnapshot,
  type AppearanceStorage,
} from './appearance-store';
