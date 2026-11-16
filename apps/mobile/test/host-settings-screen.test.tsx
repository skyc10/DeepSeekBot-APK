// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

import type { SettingsDescribe, SettingsNamespace, SettingsSaveResult } from '../src/host/host-settings';
import { HostSettingsView, type HostSettingsPort } from '../src/ui/host-settings-screen';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

const button = (view: HTMLElement, label: string) =>
  view.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

const type = (field: HTMLTextAreaElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
};

async function render(port: HostSettingsPort): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<HostSettingsView port={port} onClose={vi.fn()} />));
  return host;
}

const namespace = (revision = 3): SettingsNamespace => ({
  ns: 'demo',
  value: { mode: 'updated', auth: { token: 'REDACTED' } },
  revision,
  writable: true,
  secrets: [{ path: ['auth', 'token'], set: true }],
});

const described = (revision = 3): SettingsDescribe => ({
  writable: true,
  hasDocument: false,
  namespaces: [namespace(revision)],
});

describe('Host settings screen', () => {
  it('edits a namespace without exposing or writing credential-managed paths', async () => {
    const save = vi.fn(async () => ({ kind: 'saved', namespace: namespace(4) }) as SettingsSaveResult);
    const port: HostSettingsPort = { describe: vi.fn(async () => described()), save };
    const view = await render(port);

    await act(async () => button(view, `demo, ${t.hostSettings.revision(3)}`).click());
    const field = view.querySelector('textarea')!;
    expect(field.value).toContain('"mode": "updated"');
    expect(field.value).not.toContain('token');

    await act(async () => button(view, t.hostSettings.save).click());
    expect(save).toHaveBeenCalledWith('demo', { mode: 'updated', auth: {} }, 3);
  });

  it('offers a reload on a revision conflict instead of silently overwriting', async () => {
    let describeCalls = 0;
    const describe = vi.fn(async () => {
      describeCalls += 1;
      return describeCalls === 1 ? described() : described(9);
    });
    const save = vi.fn(async () => ({ kind: 'conflict', expected: 3, actual: 9 }) as SettingsSaveResult);
    const port: HostSettingsPort = { describe, save };
    const view = await render(port);

    await act(async () => button(view, `demo, ${t.hostSettings.revision(3)}`).click());
    await act(async () => button(view, t.hostSettings.save).click());
    expect(view.textContent).toContain(t.hostSettings.conflict(3, 9));

    await act(async () => button(view, t.hostSettings.reload).click());
    expect(describe).toHaveBeenCalledTimes(2);
    expect(button(view, `demo, ${t.hostSettings.revision(9)}`)).not.toBeNull();
  });

  it('shows a rejection message when the host rejects the value', async () => {
    const save = vi.fn(
      async () => ({ kind: 'rejected', message: 'bad value' }) as SettingsSaveResult,
    );
    const port: HostSettingsPort = { describe: vi.fn(async () => described()), save };
    const view = await render(port);

    await act(async () => button(view, `demo, ${t.hostSettings.revision(3)}`).click());
    await act(async () => button(view, t.hostSettings.save).click());
    expect(view.textContent).toContain('bad value');
  });
});
