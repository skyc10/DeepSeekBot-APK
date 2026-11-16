import { useHostSession } from '../../host/host-session';
import { SHEET_GROUP } from '../chat/sheet';
import { Segmented } from '../primitives/segmented';
import { SettingsFormItem } from '../primitives/settings-form';
import { Notice } from '../request-parts';
import { useStrings } from '../strings';

export type RouteKind = 'connect' | 'tailscale' | 'lan';

export function classifyRoute(url: string): RouteKind {
  try {
    const u = new URL(url);
    const host = u.hostname;
    if (
      host.endsWith('.ts.net') ||
      /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/u.test(host)
    )
      return 'tailscale';
    if (isLanHost(host) && u.protocol === 'http:' && u.port !== '') return 'lan';
    return 'connect';
  } catch {
    return 'connect';
  }
}

function isLanHost(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/u.test(p) || Number(p) > 255))
    return false;
  const [a, b] = parts.map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function RouteSelector() {
  const { saved, client } = useHostSession();
  const t = useStrings();
  const snapshot = client?.getSnapshot();
  const currentPreference = snapshot?.routePreference ?? saved?.routePreference;
  const routes = saved?.routes ?? [];
  const currentRoute = snapshot?.connection?.route ?? routes[0] ?? '';
  const currentKind = currentPreference
    ? classifyRoute(currentPreference)
    : classifyRoute(currentRoute);

  const handleChange = async (kind: RouteKind) => {
    const target = routes.find((r) => classifyRoute(r) === kind) ?? routes[0];
    if (target && client?.setRoutePreference) {
      await client.setRoutePreference(target);
    }
  };

  if (routes.length <= 1) return null;

  return (
    <SettingsFormItem>
      <Segmented
        label={t.routeSelector?.title ?? 'Route'}
        options={[
          { value: 'connect' as RouteKind, label: t.routeSelector?.connect ?? 'Connect' },
          { value: 'tailscale' as RouteKind, label: t.routeSelector?.tailscale ?? 'Tailscale' },
          { value: 'lan' as RouteKind, label: t.routeSelector?.lan ?? 'LAN' },
        ]}
        value={currentKind}
        onChange={handleChange}
      />
      {client?.secretInputAllowed?.() === false ? null : (
        <Notice tone="info">
          {t.routeSelector?.hint ?? 'Switch to Tailscale or LAN for full settings access.'}
        </Notice>
      )}
    </SettingsFormItem>
  );
}
