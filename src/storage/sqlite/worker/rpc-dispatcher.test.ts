import { describe, expect, it } from 'vitest';
import type { StorageProvider } from '../../../core/storage/storage-provider.js';
import { createRpcDispatcher } from './rpc-dispatcher.js';

function fakeProvider(overrides: Partial<StorageProvider> = {}): StorageProvider {
  return {
    init: async () => undefined,
    saveNode: async () => undefined,
    getNode: async () => undefined,
    deleteNode: async () => undefined,
    listNodes: async () => [],
    saveRelationship: async () => undefined,
    getRelationship: async () => undefined,
    deleteRelationship: async () => undefined,
    listRelationships: async () => [],
    getRelationshipsForNode: async () => [],
    saveView: async () => undefined,
    getView: async () => undefined,
    deleteView: async () => undefined,
    listViews: async () => [],
    close: async () => undefined,
    ...overrides,
  };
}

describe('createRpcDispatcher', () => {
  it('calls the named method with the request args and wraps the result as a success response', async () => {
    const provider = fakeProvider({
      getNode: async (id: string) => (id === 'x' ? undefined : undefined),
    });
    const dispatch = createRpcDispatcher(provider);
    const response = await dispatch({ id: 1, method: 'getNode', args: ['x'] });
    expect(response).toEqual({ id: 1, ok: true, result: undefined });
  });

  it('passes through a resolved value as the success result', async () => {
    const provider = fakeProvider({ listNodes: async () => [] });
    const dispatch = createRpcDispatcher(provider);
    const response = await dispatch({ id: 2, method: 'listNodes', args: [] });
    expect(response).toEqual({ id: 2, ok: true, result: [] });
  });

  it('wraps a thrown Error as an error response carrying its message', async () => {
    const provider = fakeProvider({
      saveNode: async () => {
        throw new Error('boom');
      },
    });
    const dispatch = createRpcDispatcher(provider);
    const response = await dispatch({ id: 3, method: 'saveNode', args: [{}] });
    expect(response).toEqual({ id: 3, ok: false, error: 'boom' });
  });

  it('stringifies a non-Error throw', async () => {
    const provider = fakeProvider({
      init: async () => {
        throw 'not an Error instance';
      },
    });
    const dispatch = createRpcDispatcher(provider);
    const response = await dispatch({ id: 4, method: 'init', args: [] });
    expect(response).toEqual({ id: 4, ok: false, error: 'not an Error instance' });
  });

  it('preserves the request id on both success and error responses', async () => {
    const provider = fakeProvider();
    const dispatch = createRpcDispatcher(provider);
    const response = await dispatch({ id: 42, method: 'close', args: [] });
    expect(response.id).toBe(42);
  });
});
