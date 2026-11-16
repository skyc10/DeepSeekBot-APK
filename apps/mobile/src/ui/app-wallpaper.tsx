import { Image } from 'expo-image';
import { View } from 'react-native';

import { resolveWallpaperSource } from './appearance-model';
import { useDesignTheme } from './design/theme';
import { useAppearance } from './native-appearance';
import { wallpaperMediaUri } from '../host/native-app-wallpaper';

/** True when a paintable wallpaper (image or video) is active. Subscribes to the store so the
 * navigator can switch its content background to transparent the moment a wallpaper is chosen
 * (or back to the solid theme color when it is cleared), with no remount. */
export function useWallpaperActive(): boolean {
  const kind = useAppearance().document.wallpaper?.kind;
  return kind === 'image' || kind === 'video';
}

/** Full-app wallpaper layer. Mounted behind the navigator so it paints across the whole app.
 * Subscribes to the appearance store, so choosing/changing/clearing a wallpaper and switching
 * light/dark takes effect immediately without remounting. Videos render their poster still
 * frame on mobile (no native video playback); the data model keeps the video id for later. */
export function AppWallpaper() {
  const { document } = useAppearance();
  const theme = useDesignTheme();
  const source = resolveWallpaperSource(document, wallpaperMediaUri);
  if (source === undefined) return null;
  return (
    <View
      pointerEvents="none"
      testID="app-wallpaper"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}
    >
      <Image
        source={{ uri: source.uri }}
        contentFit={source.fit}
        contentPosition={{ left: `${source.x * 100}%`, top: `${source.y * 100}%` }}
        transition={0}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {/* Theme-canvas scrim keeps foreground text readable; its color follows the active mode. */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: theme.color.base,
          opacity: source.fade / 100,
        }}
      />
    </View>
  );
}
