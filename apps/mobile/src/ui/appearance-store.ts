import {
  coerceAppearanceDocument,
  defaultAppearanceDocument,
  setGlass,
  setMaterialEnabled,
  setPreference,
  setPreset,
  setStyle,
  setWallpaper,
  type AppearanceDocument,
  type Preference,
  type Scheme,
  type ThemePreset,
  type ThemeStyle,
  type WallpaperMedia,
} from './appearance-model';

export type AppearanceStorage = {
  read(): Promise<unknown>;
  write(value: AppearanceDocument): void;
};

export type AppearanceSnapshot = {
  document: AppearanceDocument;
  loaded: boolean;
  storageError: boolean;
};

/** Reusable appearance store. Mirrors the interfacePreferences / chatBackgrounds contract:
 * a subscribe/getSnapshot pair for useSyncExternalStore, async restore, synchronous edits that
 * bump the document revision, and persistence through a storage port. The app has a single
 * writer (this store), so there is no cross-writer conflict resolution here; writes are
 * verified by read-back in the document layer. The port's `write` may optionally enforce an
 * expected revision when a host needs optimistic concurrency, but this store does not claim it. */
export function createAppearanceStore() {
  let document = defaultAppearanceDocument();
  let snapshot: AppearanceSnapshot = { document, loaded: false, storageError: false };
  let storage: AppearanceStorage | undefined;
  let touched = false;
  const listeners = new Set<() => void>();

  const publish = () => {
    snapshot = { ...snapshot, document };
    for (const listener of listeners) listener();
  };
  const persist = () => {
    if (storage === undefined) return;
    try {
      storage.write(document);
      snapshot = { ...snapshot, storageError: false };
    } catch {
      snapshot = { ...snapshot, storageError: true };
    }
  };
  const commit = (next: AppearanceDocument) => {
    document = next;
    touched = true;
    if (snapshot.loaded) persist();
    publish();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async restore(adapter: AppearanceStorage) {
      storage = adapter;
      let restored: AppearanceDocument | undefined;
      try {
        restored = coerceAppearanceDocument(await adapter.read());
      } catch {
        snapshot = { ...snapshot, storageError: true };
      }
      if (!touched && restored !== undefined) document = restored;
      snapshot = { ...snapshot, loaded: true };
      if (touched) persist();
      publish();
    },
    setPreference(preference: Preference) {
      commit(setPreference(document, preference));
    },
    setStyle(style: ThemeStyle) {
      commit(setStyle(document, style));
    },
    setMaterialEnabled(enabled: boolean) {
      commit(setMaterialEnabled(document, enabled));
    },
    setGlass(enabled: boolean) {
      commit(setGlass(document, enabled));
    },
    setPreset(scheme: Scheme, preset: ThemePreset) {
      commit(setPreset(document, scheme, preset));
    },
    setWallpaper(wallpaper: WallpaperMedia | undefined) {
      commit(setWallpaper(document, wallpaper));
    },
    retrySave() {
      if (snapshot.loaded) persist();
      publish();
    },
  };
}

export type AppearanceStore = ReturnType<typeof createAppearanceStore>;

/** Process-wide store. Kept in this native-free module so `useDesignTheme` can subscribe in
 * Node tests; the native adapter restores persisted state into it at app startup. */
export const appearanceStore = createAppearanceStore();

/** Project a document into the scheme used by resolveTheme. When preference is `system`
 * the caller substitutes the OS scheme. */
export function documentScheme(doc: AppearanceDocument, system: Scheme): Scheme {
  return doc.preference === 'system' ? system : doc.preference;
}
