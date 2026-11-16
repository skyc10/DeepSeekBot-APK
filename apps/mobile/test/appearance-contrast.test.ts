import { describe, it, expect } from 'vitest';
import { resolveTheme, contrast } from '../src/ui/design/resolve-theme';

describe('appearance contrast', () => {
  for (const scheme of ['light', 'dark'] as const) {
    for (const preset of ['classic-blue', 'mist-purple', 'forest-green', 'warm-amber'] as const) {
      it(`${preset} ${scheme}`, () => {
        const t = resolveTheme(scheme, { scheme, preset }, 'ios');
        expect(contrast(t.color.fg, t.color.base)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.color.onAccent, t.color.accent)).toBeGreaterThanOrEqual(3);
      });
    }
  }
});
