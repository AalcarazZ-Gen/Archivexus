import { describe, expect, it } from 'vitest';
import { createNode } from '../../core/domain/node.js';
import type { StorageRpcRequest, StorageRpcResponse } from './worker/protocol.js';
import { WorkerStorageProvider, type RpcTransport } from './worker-storage-provider.js';

/**
 * A fake `RpcTransport` standing in for a real `Worker` — captures every
 * posted request and lets the test script canned responses, so this
 * exercises `WorkerStorageProvider`'s request/response correlation logic
 * with no real Worker/postMessage involved (that part is inherently
 * outside what this sandbox can verify — see `create-sqlite-storage-provider.ts`).
 */
function createFakeTransport(): {
  transport: RpcTransport;
  sent: StorageRpcRequest[];
  respond: (response: StorageRpcResponse) => void;
} {
  const sent: StorageRpcRequest[] = [];
  const transport: RpcTransport = {
    postMessage(message) {
      sent.push(message);
    },
    onmessage: null,
  };
  return {
    transport,
    sent,
    respond(response) {
      transport.onmessage?.({ data: response });
    },
  };
}

describe('WorkerStorageProvider', () => {
  it('posts a request with an incrementing id and the method/args', async () => {
    const { transport, sent, respond } = createFakeTransport();
    const provider = new WorkerStorageProvider(transport);

    const getNodePromise = provider.getNode('Node.1');
    expect(sent).toEqual([{ id: 1, method: 'getNode', args: ['Node.1'] }]);
    respond({ id: 1, ok: true, result: undefined });
    await expect(getNodePromise).resolves.toBeUndefined();

    provider.listNodes();
    expect(sent[1]).toEqual({ id: 2, method: 'listNodes', args: [] });
  });

  it('resolves the matching call when a success response arrives', async () => {
    const { transport, respond } = createFakeTransport();
    const provider = new WorkerStorageProvider(transport);
    const node = createNode({ id: 'Node.1', type: 'City', title: 'Puerto Umbral' });

    const promise = provider.getNode('Node.1');
    respond({ id: 1, ok: true, result: node });
    await expect(promise).resolves.toEqual(node);
  });

  it('rejects the matching call when an error response arrives', async () => {
    const { transport, respond } = createFakeTransport();
    const provider = new WorkerStorageProvider(transport);

    const promise = provider.saveNode(createNode({ id: 'Node.1', type: 'City', title: 'A' }));
    respond({ id: 1, ok: false, error: 'db is closed' });
    await expect(promise).rejects.toThrow('db is closed');
  });

  it('correlates concurrent calls by id, even if responses arrive out of order', async () => {
    const { transport, respond } = createFakeTransport();
    const provider = new WorkerStorageProvider(transport);

    const first = provider.getNode('Node.1');
    const second = provider.getNode('Node.2');

    // Respond to the second request first.
    respond({ id: 2, ok: true, result: undefined });
    respond({ id: 1, ok: true, result: undefined });

    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
  });

  it('ignores a response with no matching pending request (e.g. a duplicate/unsolicited message)', async () => {
    const { transport, respond } = createFakeTransport();
    new WorkerStorageProvider(transport);
    expect(() => respond({ id: 999, ok: true, result: undefined })).not.toThrow();
  });

  it('every StorageProvider method posts its own distinct RPC method name', () => {
    const { transport, sent } = createFakeTransport();
    const provider = new WorkerStorageProvider(transport);

    void provider.init();
    void provider.saveNode(createNode({ id: 'n', type: 'City', title: 't' }));
    void provider.getNode('n');
    void provider.deleteNode('n');
    void provider.listNodes();
    void provider.saveRelationship({
      id: 'r',
      kind: 'relationship',
      origin: 'a',
      target: 'b',
      definitionId: 'd',
      title: 't',
      visibility: 'hidden',
      metadata: {},
      history: [],
      blocks: [],
      tags: [],
      references: [],
    });
    void provider.getRelationship('r');
    void provider.deleteRelationship('r');
    void provider.listRelationships();
    void provider.getRelationshipsForNode('n');
    void provider.close();

    expect(sent.map((r) => r.method)).toEqual([
      'init',
      'saveNode',
      'getNode',
      'deleteNode',
      'listNodes',
      'saveRelationship',
      'getRelationship',
      'deleteRelationship',
      'listRelationships',
      'getRelationshipsForNode',
      'close',
    ]);
  });
});
