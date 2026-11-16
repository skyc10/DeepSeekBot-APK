import { describe, expect, it, vi } from 'vitest';

import { MethodRefused } from '../src/host/client';
import {
  describeSettings,
  omitSecretPaths,
  saveSettingsValue,
  settingsFailure,
  updateSettings,
  type HostClient,
  type SettingsNamespace,
} from '../src/host/host-settings';

const namespace = (overrides: Partial<SettingsNamespace> = {}): SettingsNamespace => ({
  ns: 'botharness-client',
  value: { sortMode: 'updated' },
  revision: 7,
  writable: true,
  ...overrides,
});

function clientHarness(result: unknown = namespace()) {
  const calls: Array<{
    method: string;
    args: Record<string, unknown> | undefined;
    via: string | undefined;
    opts: { raw?: boolean } | undefined;
  }> = [];
  let failure: unknown;
  const client = {
    call: vi.fn(async (method, args, via, opts) => {
      calls.push({ method, args, via, opts });
      if (failure !== undefined) throw failure;
      return result;
    }),
  } as unknown as HostClient;
  return {
    client,
    calls,
    fail: (error: unknown) => {
      failure = error;
    },
  };
}

describe('host settings transport', () => {
  it('describes settings with no arguments', async () => {
    const { client, calls } = clientHarness({ writable: true, hasDocument: false, namespaces: [] });
    await describeSettings(client);
    expect(calls).toEqual([
      { method: 'settings/describe', args: {}, via: undefined, opts: undefined },
    ]);
  });

  it('writes a namespace with the optimistic revision fence', async () => {
    const { client, calls } = clientHarness();
    await updateSettings(client, 'ns', { a: 1 }, 3);
    expect(calls[0]).toMatchObject({
      method: 'settings/update',
      args: { ns: 'ns', patch: { a: 1 }, expectedRevision: 3 },
    });
  });
});

describe('settingsFailure', () => {
  it('maps a conflict refusal to expected and actual revisions', () => {
    const failure = settingsFailure(
      new MethodRefused('settings/conflict', 'stale', { expected: 3, actual: 5 }),
    );
    expect(failure).toEqual({ kind: 'conflict', expected: 3, actual: 5 });
  });

  it('maps rejection and secret-route refusal', () => {
    expect(settingsFailure(new MethodRefused('settings/rejected', 'invalid value'))).toEqual({
      kind: 'rejected',
      message: 'invalid value',
    });
    expect(settingsFailure(new MethodRefused('secret-route-refused', 'no'))).toEqual({
      kind: 'refused',
    });
  });

  it('returns undefined for unrelated errors', () => {
    expect(settingsFailure(new Error('network'))).toBeUndefined();
    expect(settingsFailure(new MethodRefused('gateway/offline', 'down'))).toBeUndefined();
  });
});

describe('saveSettingsValue', () => {
  it('returns the written namespace on success', async () => {
    const written = namespace({ revision: 8 });
    const { client } = clientHarness(written);
    await expect(saveSettingsValue(client, 'ns', { a: 1 }, 7)).resolves.toEqual({
      kind: 'saved',
      namespace: written,
    });
  });

  it('surfaces conflicts, rejections, refusals and unknown errors', async () => {
    const { client, fail } = clientHarness();
    fail(new MethodRefused('settings/conflict', 'stale', { expected: 2, actual: 4 }));
    await expect(saveSettingsValue(client, 'ns', {}, 2)).resolves.toEqual({
      kind: 'conflict',
      expected: 2,
      actual: 4,
    });

    fail(new MethodRefused('settings/rejected', 'bad'));
    await expect(saveSettingsValue(client, 'ns', {}, 2)).resolves.toEqual({
      kind: 'rejected',
      message: 'bad',
    });

    fail(new MethodRefused('secret-route-refused', 'no'));
    await expect(saveSettingsValue(client, 'ns', {}, 2)).resolves.toEqual({ kind: 'refused' });

    fail(new Error('network'));
    await expect(saveSettingsValue(client, 'ns', {}, 2)).resolves.toEqual({ kind: 'error' });
  });
});

describe('omitSecretPaths', () => {
  it('removes nested credential paths without mutating the source', () => {
    const value = {
      provider: 'openai',
      auth: { apiKey: 'REDACTED', token: 'REDACTED', region: 'eu' },
      models: [{ id: 'gpt' }],
    };
    const result = omitSecretPaths(value, [
      { path: ['auth', 'apiKey'], set: true },
      { path: ['auth', 'token'], set: false },
    ]);
    expect(result).toEqual({ provider: 'openai', auth: { region: 'eu' }, models: [{ id: 'gpt' }] });
    expect(value.auth).toHaveProperty('apiKey');
    expect(value.auth).toHaveProperty('token');
  });

  it('is a no-op without secrets and tolerates absent paths', () => {
    const value = { a: 1 };
    expect(omitSecretPaths(value, undefined)).toBe(value);
    expect(omitSecretPaths(value, [])).toBe(value);
    expect(omitSecretPaths(value, [{ path: ['missing', 'deep'], set: true }])).toEqual({ a: 1 });
  });
});
