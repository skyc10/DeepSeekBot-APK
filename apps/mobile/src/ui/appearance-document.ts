import { File, Paths } from 'expo-file-system';

import {
  defaultAppearanceDocument,
  parseAppearanceDocument,
  type AppearanceDocument,
} from './appearance-model';

export {
  APPEARANCE_PRESETS,
  APPEARANCE_VERSION,
  coerceAppearanceDocument,
  coerceWallpaper,
  defaultAppearanceDocument,
  modeFor,
  paintSource,
  parseAppearanceDocument,
  setMaterialEnabled,
  setPreference,
  setPreset,
  setStyle,
  setWallpaper,
  usesGlass,
  type AppearanceDocument,
  type Material,
  type ModeConfig,
  type Preference,
  type Scheme,
  type ThemePreset,
  type ThemeStyle,
  type WallpaperMedia,
} from './appearance-model';

const FILE_NAME = 'deepseekbot-appearance.json';

export function appearanceFile() {
  return new File(Paths.document, FILE_NAME);
}

/** Persist a document. When `expectedRevision` is provided the on-disk document must carry
 * that revision, otherwise the write is refused with `appearance-revision-conflict` — the
 * same optimistic-concurrency contract the host uses for settings/update. The write is
 * verified by reading the exact bytes back, matching the chat-background storage policy. */
export function writeAppearanceDocument(
  doc: AppearanceDocument,
  expectedRevision?: number,
): void {
  const f = appearanceFile();
  if (expectedRevision !== undefined) {
    if (!f.exists) throw Error('appearance-revision-conflict');
    let current: AppearanceDocument;
    try {
      current = parseAppearanceDocument(f.textSync());
    } catch {
      throw Error('appearance-storage-unreadable');
    }
    if (current.revision !== expectedRevision) throw Error('appearance-revision-conflict');
  }
  const body = JSON.stringify(doc);
  try {
    if (!f.exists) f.create();
    f.writeSync(body);
  } catch {
    if (!f.exists || f.textSync() !== body) throw Error('appearance-storage-failed');
  }
  if (f.textSync() !== body) throw Error('appearance-storage-failed');
}

export async function readAppearanceDocument(): Promise<AppearanceDocument> {
  const f = appearanceFile();
  if (!f.exists) return defaultAppearanceDocument();
  return parseAppearanceDocument(await f.text());
}
