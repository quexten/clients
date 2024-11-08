import { Jsonify } from "type-fest";

import { EncryptService } from "../../../platform/abstractions/encrypt.service";
import Domain from "../../../platform/models/domain/domain-base";
import { EncString } from "../../../platform/models/domain/enc-string";
import { SymmetricCryptoKey } from "../../../platform/models/domain/symmetric-crypto-key";
import { FolderData } from "../data/folder.data";
import { FolderView } from "../view/folder.view";

export class Test extends Domain {
  id: string;
  name: EncString;
  revisionDate: Date;
}

export class Folder extends Domain {
  id: string;
  name: EncString;
  revisionDate: Date;

  constructor(obj?: FolderData) {
    super();
    if (obj == null) {
      return;
    }

    this.buildDomainModel(
      this,
      obj,
      {
        id: null,
        name: null,
      },
      ["id"],
    );

    this.revisionDate = obj.revisionDate != null ? new Date(obj.revisionDate) : null;
  }

  decrypt(): Promise<FolderView> {
    return this.decryptObj(
      new FolderView(this),
      {
        name: null,
      },
      null,
    );
  }

  async decryptWithKey(
    key: SymmetricCryptoKey,
    encryptService: EncryptService,
  ): Promise<FolderView> {
    const decrypted = await this.decryptObjWithKey(["name"], key, encryptService, Folder);

    const view = new FolderView(decrypted);
    view.name = decrypted.name;
    return view;
  }

  static fromJSON(obj: Jsonify<Folder>) {
    const revisionDate = obj.revisionDate == null ? null : new Date(obj.revisionDate);
    return Object.assign(new Folder(), obj, { name: EncString.fromJSON(obj.name), revisionDate });
  }
}
