import {
  importWallpaperImage,
  importWallpaperVideo,
  pickWallpaper,
  type PickedWallpaper,
} from '../../src/host/native-app-wallpaper';
import {
  AppearanceSettingsContent,
  type WallpaperPorts,
} from '../../src/ui/appearance-settings';
import { useAppearance } from '../../src/ui/native-appearance';

async function pickAsDocument() {
  const picked: PickedWallpaper | undefined = await pickWallpaper();
  if (picked === undefined) return undefined;
  if (picked.kind === 'video') {
    const { id, posterId } = await importWallpaperVideo(picked);
    return {
      kind: 'video' as const,
      id,
      posterId,
      fit: 'cover' as const,
      x: 0.5,
      y: 0.5,
      fade: 60,
    };
  }
  const id = await importWallpaperImage(picked);
  return { kind: 'image' as const, id, fit: 'cover' as const, x: 0.5, y: 0.5, fade: 60 };
}

const wallpaperPorts: WallpaperPorts = { pick: pickAsDocument };

export default function AppearanceSettingsScreen() {
  const snapshot = useAppearance();
  return <AppearanceSettingsContent snapshot={snapshot} wallpaper={wallpaperPorts} />;
}
