import { describe, it, expect } from 'vitest';
import {
  createAppearanceStore,
  documentScheme,
  type AppearanceStorage,
} from '../src/ui/appearance-store';

function memoryStorage(initial?: unknown) {
  let value = initial;
  let writes = 0;
  const storage: AppearanceStorage = {
    async read() {
      return value;
    },
    write(next) {
      value = JSON.parse(JSON.stringify(next)) as unknown;
      writes += 1;
    },
  };
  return { storage, reads: () => value, writes: () => writes };
}

describe('appearance store - restore', () => {
  it('starts unloaded with the default document', () => {
    const store = createAppearanceStore();
    expect(store.getSnapshot().loaded).toBe(false);
    expect(store.getSnapshot().document.revision).toBe(1);
  });

  it('restores a valid persisted document and normalizes it', async () => {
    const { storage } = memoryStorage({
      version: 1,
      revision: 9,
      preference: 'dark',
      style: 'glass',
      materialEnabled: true,
      modes: {
        light: { preset: 'warm-amber' },
        dark: { preset: 'forest-green' },
      },
    });
    const store = createAppearanceStore();
    await store.restore(storage);
    const snap = store.getSnapshot();
    expect(snap.loaded).toBe(true);
    expect(snap.document.revision).toBe(9);
    expect(snap.document.preference).toBe('dark');
    expect(snap.document.style).toBe('glass');
    expect(snap.document.materialEnabled).toBe(true);
    expect(snap.document.modes.dark.preset).toBe('forest-green');
  });

  it('falls back to defaults when storage is unreadable', async () => {
    const store = createAppearanceStore();
    await store.restore({
      async read() {
        throw Error('boom');
      },
      write() {},
    });
    const snap = store.getSnapshot();
    expect(snap.loaded).toBe(true);
    expect(snap.storageError).toBe(true);
    expect(snap.document.revision).toBe(1);
  });
});

describe('appearance store - edits', () => {
  it('does not persist edits before restore, then flushes them on restore', async () => {
    const { storage, writes } = memoryStorage();
    const store = createAppearanceStore();
    store.setStyle('glass');
    expect(writes()).toBe(0);
    await store.restore(storage);
    expect(writes()).toBe(1);
    expect(store.getSnapshot().document.style).toBe('glass');
  });

  it('persists each loaded edit and bumps revision', async () => {
    const { storage, writes, reads } = memoryStorage();
    const store = createAppearanceStore();
    await store.restore(storage);
    store.setPreset('light', 'mist-purple');
    store.setMaterialEnabled(true);
    const snap = store.getSnapshot();
    expect(writes()).toBe(2);
    expect(snap.document.revision).toBe(3);
    const persisted = (await storage.read()) as { revision: number; materialEnabled: boolean };
    expect(persisted.revision).toBe(3);
    expect(persisted.materialEnabled).toBe(true);
    expect(reads()).toBeDefined();
  });

  it('does not let a late restore clobber an edit made while loading', async () => {
    let resolveRead: ((v: unknown) => void) | undefined;
    const storage: AppearanceStorage = {
      read() {
        return new Promise((resolve) => {
          resolveRead = resolve;
        });
      },
      write() {},
    };
    const store = createAppearanceStore();
    const restoring = store.restore(storage);
    store.setStyle('glass');
    resolveRead?.({
      version: 1,
      revision: 1,
      modes: { light: { preset: 'warm-amber' } },
    });
    await restoring;
    expect(store.getSnapshot().document.style).toBe('glass');
  });

  it('notifies subscribers and recovers from storage errors', async () => {
    let fail = true;
    const storage: AppearanceStorage = {
      async read() {
        return undefined;
      },
      write() {
        if (fail) throw Error('disk full');
      },
    };
    const store = createAppearanceStore();
    await store.restore(storage);
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });
    store.setStyle('image');
    expect(store.getSnapshot().storageError).toBe(true);
    expect(notifications).toBeGreaterThan(0);
    fail = false;
    store.retrySave();
    expect(store.getSnapshot().storageError).toBe(false);
  });
});

describe('documentScheme', () => {
  it('follows system for system preference and stays explicit otherwise', () => {
    const base = createAppearanceStore().getSnapshot().document;
    expect(documentScheme(base, 'dark')).toBe('dark');
    const explicit = { ...base, preference: 'light' as const };
    expect(documentScheme(explicit, 'dark')).toBe('light');
  });
});
