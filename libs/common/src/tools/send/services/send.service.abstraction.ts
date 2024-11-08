import { Observable } from "rxjs";

import { UserKeyRotationDataProvider } from "@bitwarden/key-management";

import { EncArrayBuffer } from "../../../platform/models/domain/enc-array-buffer";
import { SymmetricCryptoKey } from "../../../platform/models/domain/symmetric-crypto-key";
import { UserId } from "../../../types/guid";
import { UserKey } from "../../../types/key";
import { SendData } from "../models/data/send.data";
import { Send } from "../models/domain/send";
import { SendWithIdRequest } from "../models/request/send-with-id.request";
import { SendView } from "../models/view/send.view";

export abstract class SendService implements UserKeyRotationDataProvider<SendWithIdRequest> {
  sends$: Observable<Send[]>;
  sendViews$: Observable<SendView[]>;

  encrypt: (
    model: SendView,
    file: File | ArrayBuffer,
    password: string,
    key?: SymmetricCryptoKey,
  ) => Promise<[Send, EncArrayBuffer]>;
  /**
   * Provides a send for a determined id
   * updates after a change occurs to the send that matches the id
   * @param id The id of the desired send
   * @returns An observable that listens to the value of the desired send
   */
  get$: (id: string) => Observable<Send | undefined>;
  /**
   * Provides re-encrypted user sends for the key rotation process
   * @param newUserKey The new user key to use for re-encryption
   * @throws Error if the new user key is null or undefined
   * @returns A list of user sends that have been re-encrypted with the new user key
   */
  getRotatedData: (
    originalUserKey: UserKey,
    newUserKey: UserKey,
    userId: UserId,
  ) => Promise<SendWithIdRequest[]>;
  /**
   * @deprecated Do not call this, use the sends$ observable collection
   */
  getAll: () => Promise<Send[]>;
  /**
   * @deprecated Only use in CLI
   */
  getFromState: (id: string) => Promise<Send>;
  /**
   * @deprecated Only use in CLI
   */
  getAllDecryptedFromState: () => Promise<SendView[]>;
}

export abstract class InternalSendService extends SendService {
  upsert: (send: SendData | SendData[]) => Promise<any>;
  replace: (sends: { [id: string]: SendData }, userId: UserId) => Promise<void>;
  delete: (id: string | string[]) => Promise<any>;
}
