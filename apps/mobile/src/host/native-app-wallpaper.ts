import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/** On-device wallpaper media storage. Shares the image budget conventions of chat backgrounds.
 * Videos keep a JPEG poster generated from the picker thumbnail; mobile renders only the poster
 * still frame (no native video playback dependency), while the data model retains the video id. */
const root = () => new Directory(Paths.document, 'app-wallpaper');
const mediaDir = () => new Directory(root(), 'media');
const MAX_EDGE = 2048;
const MAX_SOURCE_PIXELS = 16_000_000;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MEDIA_ID = /^[\w-]+\.(?:jpg|jpeg|png|mp4|mov|webm)$/iu;

function nextId(extension: string): string {
  return `wp-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
}

export function wallpaperMediaUri(id: string): string {
  if (!MEDIA_ID.test(id)) throw Error('wallpaper-invalid-media');
  return new File(mediaDir(), id).uri;
}

async function saveJpeg(
  sourceUri: string,
  dimensions?: { width: number; height: number },
): Promise<{ id: string; width: number; height: number }> {
  const context = ImageManipulator.manipulate(sourceUri);
  let rendered: ImageRef | undefined;
  try {
    if (dimensions && (dimensions.width > MAX_EDGE || dimensions.height > MAX_EDGE)) {
      context.resize(
        dimensions.width >= dimensions.height ? { width: MAX_EDGE } : { height: MAX_EDGE },
      );
    }
    rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.88 });
    const dir = mediaDir();
    if (!dir.exists) dir.create({ intermediates: true });
    const id = nextId('jpg');
    const target = new File(dir, id);
    const temporary = new File(saved.uri);
    try {
      await temporary.copy(target);
      if (!target.exists || target.size === 0 || target.size > MAX_FILE_BYTES)
        throw Error('wallpaper-copy-failed');
      return { id, width: saved.width, height: saved.height };
    } catch (error) {
      if (target.exists) target.delete();
      throw error;
    } finally {
      if (temporary.exists) temporary.delete();
    }
  } finally {
    rendered?.release();
    context.release();
  }
}

async function saveVideo(uri: string): Promise<string> {
  const dir = mediaDir();
  if (!dir.exists) dir.create({ intermediates: true });
  const id = nextId('mp4');
  const target = new File(dir, id);
  try {
    await new File(uri).copy(target);
    if (!target.exists || target.size === 0 || target.size > 64 * 1024 * 1024)
      throw Error('wallpaper-copy-failed');
    return id;
  } catch (error) {
    if (target.exists) target.delete();
    throw error;
  }
}

export type PickedWallpaper =
  | { kind: 'image'; uri: string; width: number; height: number }
  | { kind: 'video'; uri: string; thumbnail?: string };

/** Open the photo library for an image or a video. Callers then import via importImage /
 * importVideo, keeping the expensive IO explicit and testable. */
export async function pickWallpaper(): Promise<PickedWallpaper | undefined> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    quality: 1,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (asset === undefined) return undefined;
  if (asset.type === 'video') {
    if (asset.uri.length === 0) return undefined;
    return {
      kind: 'video',
      uri: asset.uri,
      ...(asset.thumbnail ? { thumbnail: asset.thumbnail } : {}),
    };
  }
  if (
    !Number.isSafeInteger(asset.width) ||
    !Number.isSafeInteger(asset.height) ||
    (asset.width ?? 0) < 1 ||
    (asset.height ?? 0) < 1 ||
    Math.max(asset.width ?? 0, asset.height ?? 0) > 16384 ||
    (asset.width ?? 0) * (asset.height ?? 0) > MAX_SOURCE_PIXELS
  )
    throw Error('wallpaper-image-budget');
  return { kind: 'image', uri: asset.uri, width: asset.width!, height: asset.height! };
}

/** Import a picked image into storage; returns the stored media id. */
export async function importWallpaperImage(source: {
  uri: string;
  width: number;
  height: number;
}): Promise<string> {
  return (await saveJpeg(source.uri, { width: source.width, height: source.height })).id;
}

/** Import a picked video plus its thumbnail poster. Returns both ids for the document. */
export async function importWallpaperVideo(source: {
  uri: string;
  thumbnail?: string;
}): Promise<{ id: string; posterId: string }> {
  const posterSource = source.thumbnail ?? source.uri;
  const poster = await saveJpeg(posterSource);
  try {
    const id = await saveVideo(source.uri);
    return { id, posterId: poster.id };
  } catch (error) {
    removeWallpaperMedia(poster.id);
    throw error;
  }
}

export function removeWallpaperMedia(id: string): void {
  if (!MEDIA_ID.test(id)) return;
  const file = new File(wallpaperMediaUri(id));
  if (file.exists) file.delete();
}
