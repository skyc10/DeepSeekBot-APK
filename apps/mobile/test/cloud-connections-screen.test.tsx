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

import type { CloudConnectionView, CloudResult } from '../src/host/host-cloud';
import {
  CloudConnectionsView,
  type CloudConnectionsPort,
} from '../src/ui/cloud-connections-screen';
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

async function render(port: CloudConnectionsPort): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(<CloudConnectionsView port={port} onClose={vi.fn()} />),
  );
  return host;
}

const connection: CloudConnectionView = {
  connection: {
    id: 'cloud-aaa',
    fingerprint: 'aaa',
    name: 'Work cloud',
    organizationId: 'org_abc123',
    channelId: `ch_${'a'.repeat(64)}`,
    actorId: `ag_${'b'.repeat(64)}`,
    ownerUserId: 'user_abc123',
    version: 1,
  },
  active: false,
  revision: 2,
  cursor: 10,
  policy: { allowedUsers: [], forwardTargets: [], environment: 'local-host' },
};

const credential = {
  version: 1,
  config: {
    formatVersion: 1,
    protocolVersion: 1,
    instanceId: 'inst_1',
    name: 'Work instance',
    environment: 'local',
    server: 'https://cloud.example.com',
    auth: {
      provider: 'workos',
      clientId: 'client_abc',
      issuer: 'https://api.workos.com/user_management/client_abc',
      authkitDomain: 'work.authkit.app',
      deviceAuthorizationEndpoint: 'https://api.workos.com/user_management/authorize/device',
      tokenEndpoint: 'https://api.workos.com/user_management/authenticate',
      jwksUri: 'https://api.workos.com/sso/jwks/client_abc',
      mobileRedirectUris: ['ai.botharness.deepseekbot.dev:/oauth2redirect'],
    },
  },
  organizationId: 'org_abc123',
  channelId: `ch_${'a'.repeat(64)}`,
  actorId: `ag_${'b'.repeat(64)}`,
  ownerUserId: 'user_abc123',
  name: 'Work cloud',
  operationId: `operation_${'d'.repeat(20)}`,
  secret: 'c'.repeat(64),
};

describe('Cloud connections screen', () => {
  it('lists connections and imports a credential to switch, clearing it afterwards', async () => {
    const list = vi.fn(async () => ({ kind: 'ok', result: { connections: [connection] } }) as CloudResult);
    const imported: CloudConnectionView = { ...connection, active: true };
    const importFn = vi.fn(
      async () => ({ kind: 'ok', result: { connections: [imported] } }) as CloudResult,
    );
    const port: CloudConnectionsPort = { list, import: importFn };
    const view = await render(port);

    expect(view.textContent).toContain('Work cloud');
    expect(view.textContent).toContain(t.cloudConnections.inactive);
    await act(async () => button(view, `Work cloud, org_abc123 · ${t.cloudConnections.inactive}`).click());

    const field = view.querySelector('textarea')!;
    await act(async () => type(field, JSON.stringify(credential)));
    await act(async () => button(view, t.cloudConnections.import).click());

    expect(importFn).toHaveBeenCalledWith(credential);
    expect(view.querySelectorAll('textarea')[0].value).toBe('');
    expect(view.textContent).not.toContain('c'.repeat(64));
    expect(view.textContent).toContain(t.cloudConnections.imported);
  });
});
