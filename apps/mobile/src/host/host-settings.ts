import { MethodRefused } from './client';

export type SettingsNamespace = {
  ns: string;
  schema?: unknown;
  value: Record<string, unknown>;
  user?: Record<string, unknown>;
  revision: number;
  secrets?: { path: string[]; set: boolean }[];
  writable?: boolean;
  base?: unknown;
  applies?: unknown;
  autoGenerate?: unknown;
};

export type SettingsDescribe = {
  writable: boolean;
  hasDocument: boolean;
  namespaces: SettingsNamespace[];
};

export type HostClient = {
  call: <T>(method: string, args?: Record<string, unknown>, via?: string, opts?: { raw?: boolean }) => Promise<T>;
};

export function describeSettings(client: HostClient): Promise<SettingsDescribe> {
  return client.call<SettingsDescribe>('settings/describe', {});
}

export type SettingsWriteFailure =
  | { kind: 'conflict'; expected: number; actual: number }
  | { kind: 'rejected'; message: string }
  | { kind: 'refused' };

export function settingsFailure(error: unknown): SettingsWriteFailure | undefined {
  if (!(error instanceof MethodRefused)) return undefined;
  if (error.code === 'settings/conflict') {
    const d = (error.details ?? {}) as { expected?: unknown; actual?: unknown };
    return { kind: 'conflict', expected: Number(d.expected), actual: Number(d.actual) };
  }
  if (error.code === 'settings/rejected') return { kind: 'rejected', message: error.message };
  if (error.code === 'secret-route-refused') return { kind: 'refused' };
  return undefined;
}

export async function updateSettings(
  client: HostClient,
  ns: string,
  patch: Record<string, unknown>,
  expectedRevision: number,
): Promise<SettingsNamespace> {
  return client.call<SettingsNamespace>('settings/update', { ns, patch, expectedRevision });
}
