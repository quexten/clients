import * as fs from "fs";
import * as path from "path";

import { firstValueFrom, map } from "rxjs";

import { CollectionRequest } from "@bitwarden/admin-console/common";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { OrganizationService } from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { SelectionReadOnlyRequest } from "@bitwarden/common/admin-console/models/request/selection-read-only.request";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { BillingAccountProfileStateService } from "@bitwarden/common/billing/abstractions/account/billing-account-profile-state.service";
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

import { CipherResponse } from "./models/cipher.response";
import { FolderResponse } from "./models/folder.response";

export class CreateCommand {
  constructor(
    private cipherService: CipherService,
    private folderService: FolderService,
    private keyService: KeyService,
    private encryptService: EncryptService,
    private apiService: ApiService,
    private folderApiService: FolderApiServiceAbstraction,
    private accountProfileService: BillingAccountProfileStateService,
    private organizationService: OrganizationService,
    private accountService: AccountService,
  ) {}

  async run(
    object: string,
    requestJson: string,
    cmdOptions: Record<string, any>,
    additionalData: any = null,
  ): Promise<Response> {
    let req: any = null;
    if (object !== "attachment") {
      if (process.env.BW_SERVE !== "true" && (requestJson == null || requestJson === "")) {
        requestJson = await CliUtils.readStdin();
      }

      if (requestJson == null || requestJson === "") {
        return Response.badRequest("`requestJson` was not provided.");
      }

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
    }

    const normalizedOptions = new Options(cmdOptions);
    switch (object.toLowerCase()) {
      case "item":
        return await this.createCipher(req);
      case "attachment":
        return await this.createAttachment(normalizedOptions, additionalData);
      case "folder":
        return await this.createFolder(req);
      case "org-collection":
        return await this.createOrganizationCollection(req, normalizedOptions);
      default:
        return Response.badRequest("Unknown object.");
    }
  }

  private async createCipher(req: CipherExport) {
    const activeUserId = await firstValueFrom(
      this.accountService.activeAccount$.pipe(map((a) => a?.id)),
    );
    const cipher = await this.cipherService.encrypt(CipherExport.toView(req), activeUserId);
    try {
      const newCipher = await this.cipherService.createWithServer(cipher);
      const decCipher = await newCipher.decrypt(
        await this.cipherService.getKeyForCipherKeyDecryption(newCipher, activeUserId),
      );
      const res = new CipherResponse(decCipher);
      return Response.success(res);
    } catch (e) {
      return Response.error(e);
    }
  }

  private async createAttachment(options: Options, additionalData: any) {
    if (options.itemId == null || options.itemId === "") {
      return Response.badRequest("`itemid` option is required.");
    }
    let fileBuf: Buffer = null;
    let fileName: string = null;
    if (process.env.BW_SERVE === "true") {
      fileBuf = additionalData.fileBuffer;
      fileName = additionalData.fileName;
    } else {
      if (options.file == null || options.file === "") {
        return Response.badRequest("`file` option is required.");
      }
      const filePath = path.resolve(options.file);
      if (!fs.existsSync(options.file)) {
        return Response.badRequest("Cannot find file at " + filePath);
      }
      fileBuf = fs.readFileSync(filePath);
      fileName = path.basename(filePath);
    }

    if (fileBuf == null) {
      return Response.badRequest("File not provided.");
    }
    if (fileName == null || fileName.trim() === "") {
      return Response.badRequest("File name not provided.");
    }

    const itemId = options.itemId.toLowerCase();
    const cipher = await this.cipherService.get(itemId);
    if (cipher == null) {
      return Response.notFound();
    }

    if (
      cipher.organizationId == null &&
      !(await firstValueFrom(this.accountProfileService.hasPremiumFromAnySource$))
    ) {
      return Response.error("Premium status is required to use this feature.");
    }

    const userKey = await this.keyService.getUserKey();
    if (userKey == null) {
      return Response.error(
        "You must update your encryption key before you can use this feature. " +
          "See https://help.bitwarden.com/article/update-encryption-key/",
      );
    }

    try {
      const activeUserId = await firstValueFrom(
        this.accountService.activeAccount$.pipe(map((a) => a?.id)),
      );
      const updatedCipher = await this.cipherService.saveAttachmentRawWithServer(
        cipher,
        fileName,
        new Uint8Array(fileBuf).buffer,
        activeUserId,
      );
      const decCipher = await updatedCipher.decrypt(
        await this.cipherService.getKeyForCipherKeyDecryption(updatedCipher, activeUserId),
      );
      return Response.success(new CipherResponse(decCipher));
    } catch (e) {
      return Response.error(e);
    }
  }

  private async createFolder(req: FolderExport) {
    const activeAccountId = await firstValueFrom(this.accountService.activeAccount$);
    const userKey = await this.keyService.getUserKeyWithLegacySupport(activeAccountId.id);
    const folder = await this.folderService.encrypt(FolderExport.toView(req), userKey);
    try {
      await this.folderApiService.save(folder);
      const newFolder = await this.folderService.get(folder.id);
      const decFolder = await newFolder.decrypt();
      const res = new FolderResponse(decFolder);
      return Response.success(res);
    } catch (e) {
      return Response.error(e);
    }
  }

  private async createOrganizationCollection(req: OrganizationCollectionRequest, options: Options) {
    if (options.organizationId == null || options.organizationId === "") {
      return Response.badRequest("`organizationid` option is required.");
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
      const organization = await this.organizationService.get(req.organizationId);
      const currentOrgUserId = organization.organizationUserId;

      const groups =
        req.groups == null
          ? null
          : req.groups.map(
              (g) => new SelectionReadOnlyRequest(g.id, g.readOnly, g.hidePasswords, g.manage),
            );
      const users =
        req.users == null
          ? [new SelectionReadOnlyRequest(currentOrgUserId, false, false, true)]
          : req.users.map(
              (u) => new SelectionReadOnlyRequest(u.id, u.readOnly, u.hidePasswords, u.manage),
            );
      const request = new CollectionRequest();
      request.name = (await this.encryptService.encrypt(req.name, orgKey)).encryptedString;
      request.externalId = req.externalId;
      request.groups = groups;
      request.users = users;
      const response = await this.apiService.postCollection(req.organizationId, request);
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
  itemId: string;
  organizationId: string;
  file: string;

  constructor(passedOptions: Record<string, any>) {
    this.organizationId = passedOptions?.organizationid || passedOptions?.organizationId;
    this.itemId = passedOptions?.itemid || passedOptions?.itemId;
    this.file = passedOptions?.file;
  }
}
