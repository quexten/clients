import { Observable } from "rxjs";

import { BitwardenClient } from "@bitwarden/sdk-internal";

import { UserId } from "../../../types/guid";

export abstract class SdkService {
  /**
   * Check if the SDK is supported in the current environment.
   */
  supported$: Observable<boolean>;

  /**
   * Retrieve a client initialized without a user.
   * This client can only be used for operations that don't require a user context.
   */
  client$: Observable<BitwardenClient | undefined>;

  /**
   * Retrieve a client initialized for a specific user.
   * This client can be used for operations that require a user context, such as retrieving ciphers
   * and operations involving crypto. It can also be used for operations that don't require a user context.
   *
   * **WARNING:** Do not use `firstValueFrom(userClient$)`! Any operations on the client must be done within the observable.
   * The client will be destroyed when the observable is no longer subscribed to.
   * Please let platform know if you need a client that is not destroyed when the observable is no longer subscribed to.
   *
   * @param userId
   */
  abstract userClient$(userId: UserId): Observable<BitwardenClient>;

  abstract failedToInitialize(category: string, error?: Error): Promise<void>;
}
