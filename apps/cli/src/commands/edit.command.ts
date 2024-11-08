import { firstValueFrom, map } from "rxjs";

import { CollectionRequest } from "@bitwarden/admin-console/common";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { SelectionReadOnlyRequest } from "@bitwarden/common/admin-console/models/request/selection-read-only.request";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { CipherExport } from "@bitwarden/common/models/export/cipher.export";
import { CollectionExport } from "@bitwarden/common/models/export/collection.export";
import { FolderExport } from "@bitwarden/common/models/export/folder.export";
import { EncryptService } from "@bitwarden/common/platform/abstractions/encrypt.service";
import { Utils } from "@bitwarden/common/platform/misc/utils";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { FolderApiServiceAbstraction } from "@bitwarden/common/vault/abstractions/folder/folder-api.service.abstraction";
import { FolderService } from "@bitwarden/common/vault/abstractions/folder/folder.service.abstraction";
import { KeyService } from "@bitwarden/key-management";

import { OrganizationCollectionRequest } from "../admin-console/models/request/organization-collection.request";
import { OrganizationCollectionResponse } from "../admin-console/models/response/organization-collection.response";
import { Response } from "../models/response";
import { CliUtils } from "../utils";
import { CipherResponse } from "../vault/models/cipher.response";
import { FolderResponse } from "../vault/models/folder.response";

export class EditCommand {
  constructor(
    private cipherService: CipherService,
    private folderService: FolderService,
    private keyService: KeyService,
    private encryptService: EncryptService,
    private apiService: ApiService,
    private folderApiService: FolderApiServiceAbstraction,
    private accountService: AccountService,
  ) {}

  async run(
    object: string,
    id: string,
    requestJson: any,
    cmdOptions: Record<string, any>,
  ): Promise<Response> {
    if (process.env.BW_SERVE !== "true" && (requestJson == null || requestJson === "")) {
      requestJson = await CliUtils.readStdin();
    }

    if (requestJson == null || requestJson === "") {
      return Response.badRequest("`requestJson` was not provided.");
    }

    let req: any = null;
    if (typeof requestJson !== "string") {
      req = requestJson;
    } else {
      try {
        const reqJson = Buffer.from(requestJson, "base64").toString();
        req = JSON.parse(reqJson);
      } catch (e) {
        return Response.badRequest("Error parsing the encoded request data.");
      }
    }

    if (id != null) {
      id = id.toLowerCase();
    }

    const normalizedOptions = new Options(cmdOptions);
    switch (object.toLowerCase()) {
      case "item":
        return await this.editCipher(id, req);
      case "item-collections":
        return await this.editCipherCollections(id, req);
      case "folder":
        return await this.editFolder(id, req);
      case "org-collection":
        return await this.editOrganizationCollection(id, req, normalizedOptions);
      default:
        return Response.badRequest("Unknown object.");
    }
  }

  private async editCipher(id: string, req: CipherExport) {
    const cipher = await this.cipherService.get(id);
    if (cipher == null) {
      return Response.notFound();
    }

    const activeUserId = await firstValueFrom(
      this.accountService.activeAccount$.pipe(map((a) => a?.id)),
    );
    let cipherView = await cipher.decrypt(
      await this.cipherService.getKeyForCipherKeyDecryption(cipher, activeUserId),
    );
    if (cipherView.isDeleted) {
      return Response.badRequest("You may not edit a deleted item. Use the restore command first.");
    }
    cipherView = CipherExport.toView(req, cipherView);
    const encCipher = await this.cipherService.encrypt(cipherView, activeUserId);
    try {
      const updatedCipher = await this.cipherService.updateWithServer(encCipher);
      const decCipher = await updatedCipher.decrypt(
        await this.cipherService.getKeyForCipherKeyDecryption(updatedCipher, activeUserId),
      );
      const res = new CipherResponse(decCipher);
      return Response.success(res);
    } catch (e) {
      return Response.error(e);
    }
  }

  private async editCipherCollections(id: string, req: string[]) {
    const cipher = await this.cipherService.get(id);
    if (cipher == null) {
      return Response.notFound();
    }
    if (cipher.organizationId == null) {
      return Response.badRequest(
        "Item does not belong to an organization. Consider moving it first.",
      );
    }

    cipher.collectionIds = req;
    try {
      const activeUserId = await firstValueFrom(
        this.accountService.activeAccount$.pipe(map((a) => a?.id)),
      );
      const updatedCipher = await this.cipherService.saveCollectionsWithServer(cipher);
      const decCipher = await updatedCipher.decrypt(
        await this.cipherService.getKeyForCipherKeyDecryption(updatedCipher, activeUserId),
      );
      const res = new CipherResponse(decCipher);
      return Response.success(res);
    } catch (e) {
      return Response.error(e);
    }
  }

  private async editFolder(id: string, req: FolderExport) {
    const folder = await this.folderService.getFromState(id);
    if (folder == null) {
      return Response.notFound();
    }

    let folderView = await folder.decrypt();
    folderView = FolderExport.toView(req, folderView);

    const activeUserId = await firstValueFrom(this.accountService.activeAccount$);
    const userKey = await this.keyService.getUserKeyWithLegacySupport(activeUserId.id);
    const encFolder = await this.folderService.encrypt(folderView, userKey);
    try {
      await this.folderApiService.save(encFolder);
      const updatedFolder = await this.folderService.get(folder.id);
      const decFolder = await updatedFolder.decrypt();
      const res = new FolderResponse(decFolder);
      return Response.success(res);
    } catch (e) {
      return Response.error(e);
    }
  }

  private async editOrganizationCollection(
    id: string,
    req: OrganizationCollectionRequest,
    options: Options,
  ) {
    if (options.organizationId == null || options.organizationId === "") {
      return Response.badRequest("`organizationid` option is required.");
    }
    if (!Utils.isGuid(id)) {
      return Response.badRequest("`" + id + "` is not a GUID.");
    }
    if (!Utils.isGuid(options.organizationId)) {
      return Response.badRequest("`" + options.organizationId + "` is not a GUID.");
    }
    if (options.organizationId !== req.organizationId) {
      return Response.badRequest("`organizationid` option does not match request object.");
    }
    try {
      const orgKey = await this.keyService.getOrgKey(req.organizationId);
      if (orgKey == null) {
        throw new Error("No encryption key for this organization.");
      }

      const groups =
        req.groups == null
          ? null
          : req.groups.map(
              (g) => new SelectionReadOnlyRequest(g.id, g.readOnly, g.hidePasswords, g.manage),
            );
      const users =
        req.users == null
          ? null
          : req.users.map(
              (u) => new SelectionReadOnlyRequest(u.id, u.readOnly, u.hidePasswords, u.manage),
            );
      const request = new CollectionRequest();
      request.name = (await this.encryptService.encrypt(req.name, orgKey)).encryptedString;
      request.externalId = req.externalId;
      request.groups = groups;
      request.users = users;
      const response = await this.apiService.putCollection(req.organizationId, id, request);
      const view = CollectionExport.toView(req);
      view.id = response.id;
      const res = new OrganizationCollectionResponse(view, groups, users);
      return Response.success(res);
    } catch (e) {
      return Response.error(e);
    }
  }
}

class Options {
  organizationId: string;

  constructor(passedOptions: Record<string, any>) {
    this.organizationId = passedOptions?.organizationid || passedOptions?.organizationId;
  }
}
