import { describe, expect, it } from 'vitest';
import { createNode } from '../../core/domain/node.js';
import type { StorageRpcRequest, StorageRpcResponse } from './worker/protocol.js';
import { WorkerStorageProvider, type RpcTransport } from './worker-storage-provider.js';

/**
 * A fake `RpcTransport` standing in for a real `Worker` — captures every
 * posted request and lets the test script canned responses (or a
 * transport-level error), so this exercises `WorkerStorageProvider`'s
 * request/response correlation and error-handling logic with no real
 * Worker/postMessage involved (that part is inherently outside what this
 * sandbox can verify — see `create-sqlite-storage-provider.ts`). Also
 * tracks whether `terminate()` was actually called, since sending a
 * `close` RPC message alone doesn't prove the Worker was released.
 */
function createFakeTransport(): {
  transport: RpcTransport;
  sent: StorageRpcRequest[];
  respond: (response: StorageRpcResponse) => void;
  fail: (event: { message?: string }) => void;
  terminated: () => boolean;
} {
  const sent: StorageRpcRequest[] = [];
  let terminated = false;
  const transport: RpcTransport = {
    postMessage(message) {
      sent.push(message);
    },
    onmessage: null,
    onerror: null,
    terminate() {
      terminated = true;
    },
  };
  return {
    transport,
    sent,
    respond(response) {
      transport.onmessage?.({ data: response });
    },
    fail(event) {
      transport.onerror?.(event);
    },
    terminated: () => terminated,
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

  it('round-trips a View through getView (curated-by-me spec survives structuredClone-shaped transport)', async () => {
    const { transport, respond } = createFakeTransport();
    const provider = new WorkerStorageProvider(transport);
    const view = {
      id: 'View.1',
      kind: 'view' as const,
      format: 'graph' as const,
      spec: {
        preset: 'curated-by-me' as const,
        rootNodeId: 'Node.city',
        relationshipIds: ['Rel.1', 'Rel.2'],
        layout: { 'Node.a': { x: 10, y: 20 } },
      },
      title: 'Curated map',
      visibility: 'hidden' as const,
      metadata: {},
      history: [],
      blocks: [],
      tags: [],
      references: [],
    };

    const promise = provider.getView('View.1');
    respond({ id: 1, ok: true, result: view });
    await expect(promise).resolves.toEqual(view);
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

  it('close() sends the close RPC, awaits its ack, and only then terminates the transport', async () => {
    const { transport, sent, respond, terminated } = createFakeTransport();
    const provider = new WorkerStorageProvider(transport);

    const closePromise = provider.close();
    expect(sent).toEqual([{ id: 1, method: 'close', args: [] }]);
    // Not terminated yet — the RPC ack hasn't arrived.
    expect(terminated()).toBe(false);

    respond({ id: 1, ok: true, result: undefined });
    await closePromise;
    expect(terminated()).toBe(true);
  });

  it('rejects a pending call (e.g. init()) when the transport reports an error, instead of hanging', async () => {
    const { transport, fail } = createFakeTransport();
    const provider = new WorkerStorageProvider(transport);

    const initPromise = provider.init();
    fail({ message: 'Worker script failed to load' });

    await expect(initPromise).rejects.toThrow('Worker script failed to load');
  });

  it('rejects every other in-flight call, not just the first, when the transport errors', async () => {
    const { transport, fail } = createFakeTransport();
    const provider = new WorkerStorageProvider(transport);

    const first = provider.getNode('Node.1');
    const second = provider.listNodes();
    fail({ message: 'crashed' });

    await expect(first).rejects.toThrow('crashed');
    await expect(second).rejects.toThrow('crashed');
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
    void provider.saveRelationshipDefinition({
      id: 'd',
      name: 'd',
      version: 1,
      inverse: 'd-inv',
      cardinality: 'many-to-many',
      symmetry: false,
      traversalCategory: 'affiliation',
    });
    void provider.getRelationshipDefinition('d');
    void provider.deleteRelationshipDefinition('d');
    void provider.listRelationshipDefinitions();
    void provider.saveView({
      id: 'v',
      kind: 'view',
      format: 'graph',
      spec: { preset: 'direct-only', rootNodeId: 'n' },
      title: 't',
      visibility: 'hidden',
      metadata: {},
      history: [],
      blocks: [],
      tags: [],
      references: [],
    });
    void provider.getView('v');
    void provider.deleteView('v');
    void provider.listViews();
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
      'saveRelationshipDefinition',
      'getRelationshipDefinition',
      'deleteRelationshipDefinition',
      'listRelationshipDefinitions',
      'saveView',
      'getView',
      'deleteView',
      'listViews',
      'close',
    ]);
  });
});
