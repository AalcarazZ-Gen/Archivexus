/**
 * Message shapes for the Worker <-> main-thread RPC that bridges the
 * async `StorageProvider` contract across the dedicated Worker boundary
 * OPFS `SyncAccessHandle`s require (ADR-0008). Every `StorageProvider`
 * method name is a valid `method`; args/result are passed as plain
 * `structuredClone`-able values (Node/Relationship/View/string/undefined) —
 * this file has no SQLite- or Foundry-specific code, just the wire shape.
 */

export type StorageRpcMethod =
  | 'init'
  | 'saveNode'
  | 'getNode'
  | 'deleteNode'
  | 'listNodes'
  | 'saveRelationship'
  | 'getRelationship'
  | 'deleteRelationship'
  | 'listRelationships'
  | 'getRelationshipsForNode'
  | 'saveView'
  | 'getView'
  | 'deleteView'
  | 'listViews'
  | 'close';

export interface StorageRpcRequest {
  readonly id: number;
  readonly method: StorageRpcMethod;
  readonly args: readonly unknown[];
}

export interface StorageRpcSuccessResponse {
  readonly id: number;
  readonly ok: true;
  readonly result: unknown;
}

export interface StorageRpcErrorResponse {
  readonly id: number;
  readonly ok: false;
  readonly error: string;
}

export type StorageRpcResponse = StorageRpcSuccessResponse | StorageRpcErrorResponse;

/** `id` reserved for messages that aren't a reply to any specific request (e.g. a Worker-startup failure). */
export const STORAGE_RPC_UNSOLICITED_ID = 0;
