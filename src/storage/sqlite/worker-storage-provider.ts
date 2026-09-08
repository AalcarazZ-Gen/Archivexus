import type { Node } from '../../core/domain/node.js';
import type { Relationship } from '../../core/domain/relationship.js';
import type { View } from '../../core/domain/view.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import type { StorageRpcMethod, StorageRpcRequest, StorageRpcResponse } from './worker/protocol.js';

/**
 * Minimal structural subset of the real DOM `Worker` this class needs —
 * same no-real-lib-dependency tradeoff as `SqliteDatabaseLike`
 * (`sqlite-executor.ts`) and Foundry's own ambient types. A real `Worker`
 * instance satisfies this; so does a hand-rolled fake in tests (see
 * `worker-storage-provider.test.ts`), with no real Worker/postMessage
 * machinery involved.
 *
 * `onerror`/`terminate` cover two real failure/lifecycle gaps a plain
 * postMessage/onmessage pair doesn't: `onerror` fires when the Worker
 * script itself fails to load/evaluate (e.g. before `sqlite.worker.ts`'s
 * own `main().catch(...)` can even run), which would otherwise leave every
 * in-flight RPC call — including `init()` — pending forever; `terminate`
 * is what actually releases the Worker's thread/resources on `close()`,
 * since sending it a `close` RPC message alone never does.
 */
export interface RpcTransport {
  postMessage(message: StorageRpcRequest): void;
  onmessage: ((event: { data: StorageRpcResponse }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
  terminate(): void;
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
    this.#transport.onerror = (event): void => this.#handleTransportError(event);
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

  /**
   * Fires when the Worker itself fails (e.g. the script fails to load or
   * throws before `sqlite.worker.ts`'s own `main().catch(...)` can run) —
   * with no matching RPC response ever coming, every in-flight call
   * (including a caller awaiting `init()`) would otherwise hang forever.
   * Rejects everything currently pending instead of leaving it silent.
   */
  #handleTransportError(event: { message?: string }): void {
    const error = new Error(
      `Storage worker failed: ${event.message ?? 'unknown error (no message on the error event).'}`,
    );
    for (const pending of this.#pending.values()) {
      pending.reject(error);
    }
    this.#pending.clear();
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

  saveView(view: View): Promise<void> {
    return this.#call('saveView', view);
  }

  getView(id: string): Promise<View | undefined> {
    return this.#call('getView', id);
  }

  deleteView(id: string): Promise<void> {
    return this.#call('deleteView', id);
  }

  listViews(): Promise<readonly View[]> {
    return this.#call('listViews');
  }

  /** Sends the `close` RPC, awaits its ack, then actually terminates the Worker — sending the message alone never released the Worker's thread/resources. */
  async close(): Promise<void> {
    await this.#call('close');
    this.#transport.terminate();
  }
}
