// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  setRoutePreference: vi.fn((_route: string) => Promise.resolve()),
  routes: [
    'https://my-host.ts.net',
    'http://192.168.1.10:8080',
    'https://connect.example.com',
  ],
}));

vi.mock('../src/host/host-session', () => ({
  useHostSession: () => ({
    saved: { routes: fixture.routes, routePreference: fixture.routes[0] },
    client: {
      getSnapshot: () => ({
        routePreference: fixture.routes[0],
        connection: { route: fixture.routes[0] },
      }),
      setRoutePreference: (route: string) => fixture.setRoutePreference(route),
      secretInputAllowed: () => true,
    },
  }),
}));
vi.mock('../src/ui/haptics', () => ({ haptic: vi.fn() }));
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

import { RouteSelector } from '../src/ui/shell/route-selector';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  fixture.setRoutePreference.mockReset();
  fixture.setRoutePreference.mockImplementation(() => Promise.resolve());
});

async function render(): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<RouteSelector />));
  return host;
}

describe('RouteSelector', () => {
  it('uses localized copy and shows an error notice when switching fails', async () => {
    fixture.setRoutePreference.mockRejectedValue(new Error('refused'));
    const view = await render();
    expect(view.querySelector(`[aria-label="${t.routeSelector.title}"]`)).not.toBeNull();
    expect(view.textContent).not.toContain('Switch to Tailscale or LAN for full settings access.');

    const lan = view.querySelector<HTMLButtonElement>(`[aria-label="${t.routeSelector.lan}"]`)!;
    await act(async () => lan.click());
    await act(async () => {
      await Promise.resolve();
    });
    expect(fixture.setRoutePreference).toHaveBeenCalledWith(fixture.routes[1]);
    expect(view.textContent).toContain(t.routeSelector.failed);
  });
});
