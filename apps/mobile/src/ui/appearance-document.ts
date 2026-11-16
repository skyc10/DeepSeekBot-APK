import { File, Paths } from 'expo-file-system';

export type ThemePreset = 'classic-blue' | 'mist-purple' | 'forest-green' | 'warm-amber';
export type ThemeStyle = 'default' | 'glass' | 'image';
export type Material = { color: string; opacity: number; blur: number };
export type AppearanceDocument = {
  version: 1;
  revision: number;
  preference: 'system' | 'light' | 'dark';
  style: ThemeStyle;
  modes: {
    light: {
      preset: ThemePreset;
      primary?: string;
      materials?: { header?: Partial<Material>; body?: Partial<Material> };
    };
    dark: {
      preset: ThemePreset;
      primary?: string;
      materials?: { header?: Partial<Material>; body?: Partial<Material> };
    };
  };
  wallpaper?:
    | { kind: 'color'; color: string }
    | { kind: 'image'; id: string; fit: 'cover' | 'contain'; x: number; y: number; fade: number };
};

const FILE_NAME = 'deepseekbot-appearance.json';

export function appearanceFile() {
  return new File(Paths.document, FILE_NAME);
}

export function defaultAppearanceDocument(): AppearanceDocument {
  return {
    version: 1,
    revision: 1,
    preference: 'system',
    style: 'default',
    modes: { light: { preset: 'classic-blue' }, dark: { preset: 'classic-blue' } },
  };
}

export function parseAppearanceDocument(raw: string): AppearanceDocument {
  const v = JSON.parse(raw) as AppearanceDocument;
  if (v.version !== 1 || typeof v.revision !== 'number') throw new Error('invalid');
  return v;
}

export function writeAppearanceDocument(doc: AppearanceDocument): void {
  const f = appearanceFile();
  if (!f.exists) f.create();
  f.writeSync(JSON.stringify(doc));
}

export async function readAppearanceDocument(): Promise<AppearanceDocument> {
  const f = appearanceFile();
  if (!f.exists) return defaultAppearanceDocument();
  return parseAppearanceDocument(await f.text());
}
