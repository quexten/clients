import { MiniUnlockMethod, MiniUnlockResult } from "../autofill/models/mini-unlock";

/**
 * How a mini window asks the main process to unlock. Each mini app (Magnify, SSH approval)
 * provides it over its own preload bridge.
 */
export abstract class MiniUnlockClient {
  abstract unlock(method: MiniUnlockMethod, secret?: string): Promise<MiniUnlockResult>;
}
