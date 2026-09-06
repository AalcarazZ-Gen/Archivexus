import type { Node } from '../../core/domain/node.js';
import type { Relationship } from '../../core/domain/relationship.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import type { StorageRpcMethod, StorageRpcRequest, StorageRpcResponse } from './worker/protocol.js';

/**
 * Minimal structural subset of the real DOM `Worker` this class needs —
 * same no-real-lib-dependency tradeoff as `SqliteDatabaseLike`
 * (`sqlite-executor.ts`) and Foundry's own ambient types. A real `Worker`
 * instance satisfies this; so does a hand-rolled fake in tests (see
 * `worker-storage-provider.test.ts`), with no real Worker/postMessage
 * machinery involved.
 */
export interface RpcTransport {
  postMessage(message: StorageRpcRequest): void;
  onmessage: ((event: { data: StorageRpcResponse }) => void) | null;
}

/**
 * Main-thread `StorageProvider` implementation that proxies every call
 * across `RpcTransport` to the dedicated Worker actually running SQLite
 * (`worker/sqlite.worker.ts`, dispatched there by `rpc-dispatcher.ts`).
 * This is the class the Foundry Adapter (or a future Web UI) actually
 * holds and calls — it never touches SQLite/OPFS/Worker internals itself,
 * only this request/response correlation.
 */
export class WorkerStorageProvider implements StorageProvider {
  readonly #transport: RpcTransport;
  #nextRequestId = 1;
  readonly #pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
  >();

  constructor(transport: RpcTransport) {
    this.#transport = transport;
    this.#transport.onmessage = (event): void => this.#handleResponse(event.data);
  }

  #handleResponse(response: StorageRpcResponse): void {
    const pending = this.#pending.get(response.id);
    if (!pending) {
      // No matching request (e.g. an unsolicited startup message) — not this class's concern.
      return;
    }
    this.#pending.delete(response.id);
    if (response.ok) {
      pending.resolve(response.result);
    } else {
      pending.reject(new Error(response.error));
    }
  }

  #call<T>(method: StorageRpcMethod, ...args: readonly unknown[]): Promise<T> {
    const id = this.#nextRequestId++;
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.#transport.postMessage({ id, method, args });
    });
  }

  init(): Promise<void> {
    return this.#call('init');
  }

  saveNode(node: Node): Promise<void> {
    return this.#call('saveNode', node);
  }

  getNode(id: string): Promise<Node | undefined> {
    return this.#call('getNode', id);
  }

  deleteNode(id: string): Promise<void> {
    return this.#call('deleteNode', id);
  }

  listNodes(): Promise<readonly Node[]> {
    return this.#call('listNodes');
  }

  saveRelationship(relationship: Relationship): Promise<void> {
    return this.#call('saveRelationship', relationship);
  }

  getRelationship(id: string): Promise<Relationship | undefined> {
    return this.#call('getRelationship', id);
  }

  deleteRelationship(id: string): Promise<void> {
    return this.#call('deleteRelationship', id);
  }

  listRelationships(): Promise<readonly Relationship[]> {
    return this.#call('listRelationships');
  }

  getRelationshipsForNode(nodeId: string): Promise<readonly Relationship[]> {
    return this.#call('getRelationshipsForNode', nodeId);
  }

  close(): Promise<void> {
    return this.#call('close');
  }
}
