import { describe, expect, it, vi } from 'vitest';

import { MethodRefused } from '../src/host/client';
import {
  importCloudCredential,
  listCloudConnections,
  parseCredentialText,
  type CloudResult,
} from '../src/host/host-cloud';
import type { HostClient } from '../src/host/host-settings';

const hex = (c: string) => c.repeat(64);
const instance = {
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
};
const credential = {
  version: 1,
  config: instance,
  organizationId: 'org_abc123',
  channelId: `ch_${hex('a')}`,
  actorId: `ag_${hex('b')}`,
  ownerUserId: 'user_abc123',
  name: 'Work cloud',
  operationId: `operation_${hex('d').slice(0, 20)}`,
  secret: hex('c'),
};

function harness(value: unknown = { connections: [] }) {
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

describe('parseCredentialText', () => {
  it('accepts a valid credential and drops nothing from it', () => {
    const parsed = parseCredentialText(JSON.stringify(credential));
    expect(parsed.kind).toBe('valid');
    if (parsed.kind === 'valid') expect(parsed.credential).toEqual(credential);
  });

  it('rejects malformed JSON, wrong shapes and oversized input', () => {
    expect(parseCredentialText('{')).toEqual({ kind: 'invalid', reason: 'json' });
    expect(parseCredentialText('[]')).toEqual({ kind: 'invalid', reason: 'shape' });
    expect(parseCredentialText(JSON.stringify({ ...credential, version: 2 }))).toEqual({
      kind: 'invalid',
      reason: 'shape',
    });
    expect(parseCredentialText(JSON.stringify({ ...credential, extra: 1 }))).toEqual({
      kind: 'invalid',
      reason: 'shape',
    });
    expect(parseCredentialText(JSON.stringify({ ...credential, secret: 'not-hex' }))).toEqual({
      kind: 'invalid',
      reason: 'shape',
    });
    expect(parseCredentialText(JSON.stringify({ ...credential, operationId: 'short' }))).toEqual({
      kind: 'invalid',
      reason: 'shape',
    });
    expect(parseCredentialText(JSON.stringify({ ...credential, name: 'bad\u0001name' }))).toEqual({
      kind: 'invalid',
      reason: 'shape',
    });
    expect(
      parseCredentialText(JSON.stringify({ ...credential, config: { formatVersion: 1 } })),
    ).toEqual({ kind: 'invalid', reason: 'shape' });
    expect(parseCredentialText('x'.repeat(20_001))).toEqual({ kind: 'invalid', reason: 'large' });
  });
});

describe('cloud connections transport', () => {
  it('lists connections through the cloudConnections bridge', async () => {
    const { secret: _secret, operationId: _operation, ...publicCredential } = credential;
    const connection = {
      connection: {
        ...publicCredential,
        id: `cloud-${hex('e')}`,
        fingerprint: hex('e'),
      },
      active: true,
      revision: 1,
      cursor: 0,
      policy: { allowedUsers: [], forwardTargets: [], environment: 'local-host' },
    };
    const value = { connections: [connection, { active: true }, 'garbage'] };
    const { client, calls } = harness(value);
    await expect(listCloudConnections(client)).resolves.toEqual({
      kind: 'ok',
      result: { connections: [connection] },
    });
    expect(calls).toEqual([{ method: 'cloudConnections', args: { operation: 'list' } }]);
  });

  it('imports a credential by operation/credential payload', async () => {
    const { client, calls } = harness();
    await expect(importCloudCredential(client, credential)).resolves.toEqual({
      kind: 'ok',
      result: { connections: [] },
    });
    expect(calls).toEqual([
      { method: 'cloudConnections', args: { operation: 'import', credential } },
    ]);
  });

  it('maps refusals, rejections, unknown errors and malformed results', async () => {
    const { client, fail } = harness('garbage');
    await expect(listCloudConnections(client)).resolves.toEqual({
      kind: 'ok',
      result: { connections: [] },
    });

    fail(new MethodRefused('secret-route-refused', 'no'));
    await expect(importCloudCredential(client, credential)).resolves.toEqual({ kind: 'refused' });
    fail(new MethodRefused('CLOUD_CONNECTION_CHANGED', 'changed'));
    await expect(listCloudConnections(client)).resolves.toEqual({
      kind: 'rejected',
      message: 'changed',
    });
    fail(new Error('network'));
    const result: CloudResult = await listCloudConnections(client);
    expect(result).toEqual({ kind: 'error' });
  });
});
