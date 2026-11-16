import { beforeEach, describe, expect, it, vi } from 'vitest';

const picker = vi.hoisted(() => ({ result: { canceled: true, assets: [] as unknown[] } }));
vi.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: async () => picker.result,
}));
vi.mock('expo-file-system', () => ({
  Directory: class {},
  File: class {},
  Paths: { document: 'doc' },
}));
vi.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: () => ({}) },
}));

import { pickWallpaper } from '../src/host/native-app-wallpaper';

describe('pickWallpaper - video degradation', () => {
  beforeEach(() => {
    picker.result = { canceled: true, assets: [] };
  });

  it('signals video-unavailable instead of reading nonexistent thumbnail fields', async () => {
    picker.result = {
      canceled: false,
      assets: [{ type: 'video', uri: 'file://clip.mp4' }],
    };
    const result = await pickWallpaper();
    expect(result).toEqual({ kind: 'video-unavailable' });
  });

  it('returns a picked image with its dimensions', async () => {
    picker.result = {
      canceled: false,
      assets: [{ type: 'image', uri: 'file://wp.jpg', width: 1080, height: 1920 }],
    };
    const result = await pickWallpaper();
    expect(result).toEqual({ kind: 'image', uri: 'file://wp.jpg', width: 1080, height: 1920 });
  });

  it('returns undefined when the picker is cancelled', async () => {
    expect(await pickWallpaper()).toBeUndefined();
  });

  it('rejects images over the pixel budget without throwing on video', async () => {
    picker.result = {
      canceled: false,
      assets: [{ type: 'image', uri: 'file://big.jpg', width: 20000, height: 20000 }],
    };
    await expect(pickWallpaper()).rejects.toThrow('wallpaper-image-budget');
  });
});
