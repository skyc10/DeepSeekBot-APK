import { describe, it, expect } from 'vitest';
import {
  APPEARANCE_PRIMARY,
  resolveMaterial,
  resolveTheme,
} from '../src/ui/design/resolve-theme';

describe('resolveTheme - preset drives primary', () => {
  it('uses the preset primary for light and dark', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const t = resolveTheme(scheme, { scheme, preset: 'warm-amber' }, 'ios');
      expect(t.color.accent).toBe(APPEARANCE_PRIMARY['warm-amber'][scheme]);
    }
  });

  it('explicit primary overrides the preset', () => {
    const t = resolveTheme('light', {
      scheme: 'light',
      preset: 'forest-green',
      primary: '#123456',
    });
    expect(t.color.accent).toBe('#123456');
  });

  it('a caller-supplied accent drives the primary when no primary is set (regression)', () => {
    expect(resolveTheme('light', { accent: '#FFD60A' }).color.accent).toBe('#ffd60a');
    expect(resolveTheme('dark', { accent: '#5b2ecc' }).color.accent).toBe('#5b2ecc');
  });

  it('an invalid accent falls back to the preset primary, not the palette accent', () => {
    // Regression: an invalid accent used to reach withAccent, which returned palette.accent
    // (#3e70db) instead of the preset primary (#4176e6).
    expect(resolveTheme('light', { accent: 'red' }).color.accent).toBe(
      APPEARANCE_PRIMARY['classic-blue'].light,
    );
    expect(resolveTheme('dark', { accent: 'not-a-color' }).color.accent).toBe(
      APPEARANCE_PRIMARY['classic-blue'].dark,
    );
  });

  it('a valid accent takes precedence over an explicit primary', () => {
    const t = resolveTheme('light', { primary: '#111111', accent: '#FFD60A' });
    expect(t.color.accent).toBe('#ffd60a');
  });

  it('an invalid accent yields to an explicit primary', () => {
    const t = resolveTheme('light', { primary: '#111111', accent: 'red' });
    expect(t.color.accent).toBe('#111111');
  });
});

describe('resolveTheme - glass materials', () => {
  it('keeps the legacy solid recipe when glass is off (default)', () => {
    for (const os of ['ios', 'android'] as const) {
      const t = resolveTheme('light', {}, os);
      expect(t.glass).toBe(false);
      expect(t.material.header).toEqual({
        color: t.color.surface,
        opacity: 80,
        blur: 24,
      });
      expect(t.material.body).toEqual({ color: t.color.base, opacity: 100, blur: 0 });
    }
  });

  it('does not enable glass from style alone without materialEnabled', () => {
    const t = resolveTheme('light', { style: 'glass' }, 'ios');
    expect(t.glass).toBe(false);
    expect(t.material.header.opacity).toBe(80);
  });

  it('does not enable glass for the default style', () => {
    const t = resolveTheme('light', { style: 'default', materialEnabled: true }, 'ios');
    expect(t.glass).toBe(false);
  });

  it('enables glass for glass and image styles when opted in', () => {
    for (const style of ['glass', 'image'] as const) {
      expect(resolveTheme('light', { style, materialEnabled: true }, 'ios').glass).toBe(true);
    }
  });

  it('uses a static frosted recipe on Android and a lighter Liquid Glass recipe on iOS', () => {
    const android = resolveTheme('light', { style: 'glass', materialEnabled: true }, 'android');
    const ios = resolveTheme('light', { style: 'glass', materialEnabled: true }, 'ios');
    expect(android.material.header.opacity).toBeGreaterThan(ios.material.header.opacity);
    expect(android.material.header.blur).toBeLessThan(ios.material.header.blur);
    expect(android.material.body.blur).toBeGreaterThan(0);
  });
});

describe('resolveMaterial - overrides', () => {
  const color = resolveTheme('light', {}, 'ios').color;
  it('applies per-mode material overrides on top of the recipe', () => {
    const solid = resolveMaterial(color, false, 'ios');
    const overridden = resolveMaterial(color, false, 'ios', {
      header: { opacity: 55, color: '#abcdef' },
    });
    expect(overridden.header.opacity).toBe(55);
    expect(overridden.header.color).toBe('#abcdef');
    expect(overridden.header.blur).toBe(solid.header.blur);
    expect(overridden.body).toEqual(solid.body);
  });

  it('glass overrides still win', () => {
    const t = resolveMaterial(color, true, 'ios', { body: { blur: 3 } });
    expect(t.body.blur).toBe(3);
  });
});
