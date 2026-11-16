import { describe, expect, it, vi } from 'vitest';

import { MethodRefused } from '../src/host/client';
import {
  describeCredentials,
  setCredential,
  unsetCredential,
  validCredentialRef,
  type HostClient,
} from '../src/host/host-credentials';

function harness(result: unknown = undefined) {
  const calls: Array<{ method: string; args: Record<string, unknown> | undefined }> = [];
  let failure: unknown;
  const client = {
    call: vi.fn(async (method: string, args?: Record<string, unknown>) => {
      calls.push({ method, args });
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

describe('credential references', () => {
  it('accepts POSIX-style names and rejects anything else', () => {
    expect(validCredentialRef('DEEPSEEK_API_KEY')).toBe(true);
    expect(validCredentialRef('_token2')).toBe(true);
    expect(validCredentialRef('a/b')).toBe(false);
    expect(validCredentialRef('1KEY')).toBe(false);
    expect(validCredentialRef('')).toBe(false);
    expect(validCredentialRef('KEY WITH SPACE')).toBe(false);
  });
});

describe('credentials transport', () => {
  it('describes the requested references without echoing values', async () => {
    const info = { DEEPSEEK_API_KEY: { configured: true, writable: true, masked: 'sk-•••' } };
    const { client, calls } = harness(info);
    await expect(describeCredentials(client, ['DEEPSEEK_API_KEY'])).resolves.toEqual(info);
    expect(calls).toEqual([
      { method: 'credentials/describe', args: { refs: ['DEEPSEEK_API_KEY'] } },
    ]);
  });

  it('drops malformed describe responses and untrusted entries', async () => {
    const { client } = harness('not an object');
    await expect(describeCredentials(client, ['KEY'])).resolves.toEqual({});

    const { client: client2 } = harness({
      GOOD: { configured: true, writable: true, masked: 'sk-•••' },
      MISSING: { configured: true },
      WRONG: { configured: 'yes', writable: true },
    });
    await expect(describeCredentials(client2, ['GOOD', 'MISSING', 'WRONG'])).resolves.toEqual({
      GOOD: { configured: true, writable: true, masked: 'sk-•••' },
    });
  });

  it('writes the secret value once through credentials/set', async () => {
    const { client, calls } = harness();
    await expect(setCredential(client, 'DEEPSEEK_API_KEY', 'sk-secret')).resolves.toEqual({
      kind: 'saved',
    });
    expect(calls).toEqual([
      { method: 'credentials/set', args: { ref: 'DEEPSEEK_API_KEY', value: 'sk-secret' } },
    ]);
  });

  it('removes by reference without a value', async () => {
    const { client, calls } = harness();
    await expect(unsetCredential(client, 'DEEPSEEK_API_KEY')).resolves.toEqual({
      kind: 'removed',
    });
    expect(calls).toEqual([{ method: 'credentials/unset', args: { ref: 'DEEPSEEK_API_KEY' } }]);
  });

  it('maps secret-route refusals, rejections and unknown errors', async () => {
    const { client, fail } = harness();
    fail(new MethodRefused('secret-route-refused', 'no'));
    await expect(setCredential(client, 'KEY', 'v')).resolves.toEqual({ kind: 'refused' });

    fail(new MethodRefused('credentials/invalid', 'bad value'));
    await expect(setCredential(client, 'KEY', 'v')).resolves.toEqual({
      kind: 'rejected',
      message: 'bad value',
    });

    fail(new MethodRefused('credentials/invalid', 'rejected sk-secret-value'));
    await expect(setCredential(client, 'KEY', 'sk-secret-value')).resolves.toEqual({
      kind: 'rejected',
      message: 'rejected [redacted]',
    });

    fail(new Error('network'));
    await expect(unsetCredential(client, 'KEY')).resolves.toEqual({ kind: 'error' });
  });

  it('keeps ordinary error text intact for short secrets', async () => {
    const { client, fail } = harness();
    fail(new MethodRefused('credentials/invalid', 'bad value'));
    await expect(setCredential(client, 'KEY', 'v')).resolves.toEqual({
      kind: 'rejected',
      message: 'bad value',
    });
    await expect(setCredential(client, 'KEY', 'sk-')).resolves.toEqual({
      kind: 'rejected',
      message: 'bad value',
    });
  });
});
