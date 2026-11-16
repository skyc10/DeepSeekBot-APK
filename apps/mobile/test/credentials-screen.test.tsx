// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const dialog = vi.hoisted(() => ({ confirmDestructive: vi.fn() }));
vi.mock('../src/ui/primitives/app-dialog', () => ({
  confirmDestructive: dialog.confirmDestructive,
}));

vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
vi.mock('../src/ui/primitives/row-icon', () => ({ RowIcon: () => null }));
vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('react-native-gesture-handler', () => import('./gesture-handler-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-worklets', () => ({
  scheduleOnRN: <A extends unknown[]>(callback: (...args: A) => void, ...args: A) =>
    callback(...args),
}));
vi.mock('../src/ui/haptics', () => ({ haptic: vi.fn() }));

import type { CredentialInfo, CredentialWriteResult } from '../src/host/host-credentials';
import { CredentialsView, type CredentialsPort } from '../src/ui/credentials-screen';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  dialog.confirmDestructive.mockReset();
});

const button = (view: HTMLElement, label: string) =>
  view.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

const type = (field: HTMLTextAreaElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
};

async function render(port: CredentialsPort): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<CredentialsView port={port} onClose={vi.fn()} />));
  return host;
}

describe('Credentials screen is write-only', () => {
  it('sends the value once, clears it, and never renders it back', async () => {
    const info: Record<string, CredentialInfo> = {
      DEEPSEEK_API_KEY: { configured: true, writable: true, masked: 'sk-•••42' },
    };
    const describe = vi.fn(async () => info);
    const set = vi.fn(async () => ({ kind: 'saved' }) as CredentialWriteResult);
    const port: CredentialsPort = { describe, set, unset: vi.fn() };
    const view = await render(port);

    const fields = view.querySelectorAll('textarea');
    await act(async () => type(fields[0], 'DEEPSEEK_API_KEY'));
    await act(async () => type(fields[1], 'sk-super-secret-value'));
    await act(async () => button(view, t.credentials.save).click());

    expect(set).toHaveBeenCalledWith('DEEPSEEK_API_KEY', 'sk-super-secret-value');
    expect(view.querySelectorAll('textarea')[1].value).toBe('');
    expect(view.textContent).not.toContain('sk-super-secret-value');
    expect(describe).toHaveBeenCalledWith(['DEEPSEEK_API_KEY']);
    expect(view.textContent).toContain('sk-•••42');
  });

  it('removes only through the standard destructive confirmation', async () => {
    const unset = vi.fn(async () => ({ kind: 'removed' }) as CredentialWriteResult);
    const port: CredentialsPort = {
      describe: vi.fn(async () => ({})),
      set: vi.fn(),
      unset,
    };
    const view = await render(port);
    await act(async () => type(view.querySelectorAll('textarea')[0], 'DEEPSEEK_API_KEY'));

    await act(async () => button(view, t.credentials.remove).click());
    expect(unset).not.toHaveBeenCalled();
    expect(dialog.confirmDestructive).toHaveBeenCalledWith(
      t.credentials.removeTitle,
      t.credentials.removeBody,
      t.credentials.remove,
      expect.any(Function),
    );
    await act(async () => {
      dialog.confirmDestructive.mock.calls[0]![3]();
    });
    expect(unset).toHaveBeenCalledWith('DEEPSEEK_API_KEY');
  });
});
