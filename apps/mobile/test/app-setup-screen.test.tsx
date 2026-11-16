// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const dialog = vi.hoisted(() => ({ confirmDestructive: vi.fn() }));
vi.mock('../src/ui/primitives/app-dialog', () => ({
  confirmDestructive: dialog.confirmDestructive,
}));

vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
vi.mock('expo-image', () => ({ Image: () => null }));
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

import type { AppSetupResult, AppSetupsResult } from '../src/host/host-app-setup';
import { AppSetupView, type AppSetupPort } from '../src/ui/app-setup-screen';
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

async function render(port: AppSetupPort): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<AppSetupView port={port} onClose={vi.fn()} />));
  return host;
}

const credentialsAttempt = {
  version: 1 as const,
  attemptId: 'att_1',
  platform: 'feishu' as const,
  state: 'credentials' as const,
  expiresAt: 1,
};

describe('IM app setup screen', () => {
  it('submits Feishu credentials once and clears the secret', async () => {
    const setups = [
      {
        version: 1 as const,
        platform: 'feishu' as const,
        providerId: 'dsh-im/feishu',
        endpoint: 'dsh-im/app-setup' as const,
        kind: 'credentials' as const,
      },
    ];
    const start = vi.fn(async () => ({ kind: 'ok', attempt: credentialsAttempt }) as AppSetupResult);
    const credentials = vi.fn(async () => ({ kind: 'ok', attempt: credentialsAttempt }) as AppSetupResult);
    const port: AppSetupPort = {
      setups: vi.fn(async () => ({ kind: 'ok', setups }) as AppSetupsResult),
      start,
      poll: vi.fn(),
      cancel: vi.fn(),
      credentials,
      verify: vi.fn(),
    };
    const view = await render(port);

    await act(async () =>
      button(view, `${t.appSetup.platform('feishu')}, ${t.appSetup.kind('credentials')}`).click(),
    );
    expect(start).toHaveBeenCalledWith('feishu');

    const fields = view.querySelectorAll('textarea');
    await act(async () => type(fields[0], 'cli_app'));
    await act(async () => type(fields[1], 'app-secret-value'));
    await act(async () => button(view, t.appSetup.submitCredentials).click());

    expect(credentials).toHaveBeenCalledWith('att_1', 'cli_app', 'app-secret-value', 'feishu');
    expect(view.querySelectorAll('textarea')[1].value).toBe('');
    expect(view.textContent).not.toContain('app-secret-value');
  });

  it('clears the secret on a rejected submit too', async () => {
    const setups = [
      {
        version: 1 as const,
        platform: 'feishu' as const,
        providerId: 'dsh-im/feishu',
        endpoint: 'dsh-im/app-setup' as const,
        kind: 'credentials' as const,
      },
    ];
    const credentialsAttempt = {
      version: 1 as const,
      attemptId: 'att_1',
      platform: 'feishu' as const,
      state: 'credentials' as const,
      expiresAt: 1,
    };
    const credentials = vi.fn(
      async () => ({ kind: 'rejected', message: 'bad credentials' }) as AppSetupResult,
    );
    const port: AppSetupPort = {
      setups: vi.fn(async () => ({ kind: 'ok', setups }) as AppSetupsResult),
      start: vi.fn(async () => ({ kind: 'ok', attempt: credentialsAttempt }) as AppSetupResult),
      poll: vi.fn(),
      cancel: vi.fn(),
      credentials,
      verify: vi.fn(),
    };
    const view = await render(port);
    await act(async () =>
      button(view, `${t.appSetup.platform('feishu')}, ${t.appSetup.kind('credentials')}`).click(),
    );
    const fields = view.querySelectorAll('textarea');
    await act(async () => type(fields[0], 'cli_app'));
    await act(async () => type(fields[1], 'app-secret-rejected'));
    await act(async () => button(view, t.appSetup.submitCredentials).click());

    expect(credentials).toHaveBeenCalledWith('att_1', 'cli_app', 'app-secret-rejected', 'feishu');
    expect(view.querySelectorAll('textarea')[1].value).toBe('');
    expect(view.textContent).not.toContain('app-secret-rejected');
    expect(view.textContent).toContain('bad credentials');
  });

  it('cancels an attempt only through the standard destructive confirmation', async () => {
    const setups = [
      {
        version: 1 as const,
        platform: 'weixin' as const,
        providerId: 'dsh-im/weixin',
        endpoint: 'dsh-im/app-setup' as const,
        kind: 'qr' as const,
      },
    ];
    const pendingAttempt = {
      version: 1 as const,
      attemptId: 'att_9',
      platform: 'weixin' as const,
      state: 'pending' as const,
      expiresAt: 1,
    };
    const cancel = vi.fn(async () => ({ kind: 'ok', attempt: pendingAttempt }) as AppSetupResult);
    const port: AppSetupPort = {
      setups: vi.fn(async () => ({ kind: 'ok', setups }) as AppSetupsResult),
      start: vi.fn(async () => ({ kind: 'ok', attempt: pendingAttempt }) as AppSetupResult),
      poll: vi.fn(),
      cancel,
      credentials: vi.fn(),
      verify: vi.fn(),
    };
    const view = await render(port);
    await act(async () =>
      button(view, `${t.appSetup.platform('weixin')}, ${t.appSetup.kind('qr')}`).click(),
    );

    await act(async () => button(view, t.appSetup.cancel).click());
    expect(cancel).not.toHaveBeenCalled();
    expect(dialog.confirmDestructive).toHaveBeenCalledWith(
      t.appSetup.cancelTitle,
      t.appSetup.cancelBody,
      t.appSetup.cancel,
      expect.any(Function),
    );
    await act(async () => {
      dialog.confirmDestructive.mock.calls[0]![3]();
    });
    expect(cancel).toHaveBeenCalledWith('att_9');
  });
});
