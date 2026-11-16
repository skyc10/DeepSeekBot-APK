import { describe, expect, it, vi } from 'vitest';

import { MethodRefused } from '../src/host/client';
import {
  cancelAppSetup,
  listAppSetups,
  pollAppSetup,
  projectAttempt,
  startAppSetup,
  submitAppCredentials,
  verifyAppSetup,
} from '../src/host/host-app-setup';
import type { HostClient } from '../src/host/host-settings';

const hex = (c: string) => c.repeat(64);
const readyAttempt = {
  version: 1,
  channel: 'feishu',
  attemptId: 'att_1',
  state: 'ready',
  expiresAt: 1,
  accountRef: 'acct_1',
  description: {
    version: 1,
    botId: 'acct_1',
    channel: 'feishu',
    connected: true,
    account: { fingerprint: hex('f'), name: 'Work' },
  },
};
const pendingAttempt = {
  version: 1,
  channel: 'weixin',
  attemptId: 'att_2',
  state: 'pending',
  expiresAt: 1,
  qrDataUrl: 'data:image/png;base64,YWJj',
};

function harness(value: unknown = pendingAttempt) {
  const calls: Array<{ method: string; args: Record<string, unknown> | undefined }> = [];
  let failure: unknown;
  const client = {
    call: vi.fn(async (method: string, args?: Record<string, unknown>) => {
      calls.push({ method, args });
      if (failure !== undefined) throw failure;
      return value;
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

describe('projectAttempt', () => {
  it('projects a ready attempt including account facts', () => {
    expect(projectAttempt(readyAttempt)).toEqual({
      version: 1,
      attemptId: 'att_1',
      platform: 'feishu',
      state: 'ready',
      expiresAt: 1,
      accountRef: 'acct_1',
      fingerprint: hex('f'),
      name: 'Work',
      connected: true,
    });
  });

  it('keeps a QR for a pending WeChat attempt', () => {
    expect(projectAttempt(pendingAttempt)?.qrDataUrl).toBe('data:image/png;base64,YWJj');
  });

  it('rejects malformed or inconsistent attempts', () => {
    expect(projectAttempt({ ...pendingAttempt, version: 2 })).toBeUndefined();
    expect(projectAttempt({ ...pendingAttempt, state: 'unknown' })).toBeUndefined();
    expect(
      projectAttempt({
        ...readyAttempt,
        description: { ...readyAttempt.description, botId: 'other' },
      }),
    ).toBeUndefined();
    expect(projectAttempt('nope')).toBeUndefined();
  });
});

describe('app setup discovery', () => {
  it('keeps only qualified version-1 descriptors', async () => {
    const setups = [
      {
        version: 1,
        platform: 'feishu',
        providerId: 'dsh-im/feishu',
        endpoint: 'dsh-im/app-setup',
        kind: 'credentials',
      },
      {
        version: 1,
        platform: 'weixin',
        providerId: 'dsh-im/weixin',
        endpoint: 'dsh-im/app-setup',
        kind: 'qr',
      },
      {
        version: 2,
        platform: 'feishu',
        providerId: 'dsh-im/feishu',
        endpoint: 'dsh-im/app-setup',
        kind: 'credentials',
      },
    ];
    const { client } = harness({ setups });
    const result = await listAppSetups(client);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') expect(result.setups).toHaveLength(2);
  });
});

describe('app setup operations', () => {
  it('sends the right method and payload for each step', async () => {
    const { client, calls } = harness();
    await startAppSetup(client, 'feishu');
    await pollAppSetup(client, 'att_2');
    await submitAppCredentials(client, 'att_2', 'cli_1', 'app-secret', 'feishu');
    await verifyAppSetup(client, 'att_2', '123456');
    await cancelAppSetup(client, 'att_2');
    expect(calls).toEqual([
      {
        method: 'dsh-im/app-setup',
        args: { method: 'setup.start', payload: { channel: 'feishu' } },
      },
      {
        method: 'dsh-im/app-setup',
        args: { method: 'setup.poll', payload: { attemptId: 'att_2' } },
      },
      {
        method: 'dsh-im/app-setup',
        args: {
          method: 'setup.credentials',
          payload: {
            attemptId: 'att_2',
            appId: 'cli_1',
            appSecret: 'app-secret',
            domain: 'feishu',
          },
        },
      },
      {
        method: 'dsh-im/app-setup',
        args: { method: 'setup.verify', payload: { attemptId: 'att_2', verifyCode: '123456' } },
      },
      {
        method: 'dsh-im/app-setup',
        args: { method: 'setup.cancel', payload: { attemptId: 'att_2' } },
      },
    ]);
  });

  it('rejects an invalid verification code locally', async () => {
    const { client, calls } = harness();
    await expect(verifyAppSetup(client, 'att_2', 'abc')).resolves.toEqual({ kind: 'error' });
    expect(calls).toEqual([]);
  });

  it('maps refusals, rejections and unknown errors', async () => {
    const { client, fail } = harness();
    fail(new MethodRefused('secret-route-refused', 'no'));
    await expect(pollAppSetup(client, 'att_2')).resolves.toEqual({ kind: 'refused' });
    fail(new MethodRefused('setup-failed', 'bad'));
    await expect(pollAppSetup(client, 'att_2')).resolves.toEqual({
      kind: 'rejected',
      message: 'bad',
    });
    fail(new Error('network'));
    await expect(cancelAppSetup(client, 'att_2')).resolves.toEqual({ kind: 'error' });
  });
});
