import { FieldType } from "@bitwarden/common/enums";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";

import { ImportResult } from "../../models/import-result";
import { BaseImporter } from "../base-importer";
import { Importer } from "../importer";

import { ProtonPassJsonFile } from "./types/protonpass-json-type";

export class ProtonPassJsonImporter extends BaseImporter implements Importer {
  constructor(private i18nService: I18nService) {
    super();
  }

  parse(data: string): Promise<ImportResult> {
    const result = new ImportResult();
    const results: ProtonPassJsonFile = JSON.parse(data);
    if (results == null || results.vaults == null) {
      result.success = false;
      return Promise.resolve(result);
    }

    if (results.encrypted) {
      result.success = false;
      result.errorMessage = this.i18nService.t("unsupportedEncryptedImport");
      return Promise.resolve(result);
    }

    for (const [, vault] of Object.entries(results.vaults)) {
      for (const item of vault.items) {
        const cipher = this.initLoginCipher();
        cipher.name = item.data.metadata.name;
        cipher.notes = item.data.metadata.note;

        switch (item.data.type) {
          case "login":
            cipher.login.uris = this.makeUriArray(item.data.content.urls);
            cipher.login.username = item.data.content.username;
            cipher.login.password = item.data.content.password;
            if (item.data.content.totpUri != "") {
              cipher.login.totp = new URL(item.data.content.totpUri).searchParams.get("secret");
            }
            break;
        }

        for (const extraField of item.data.extraFields) {
          this.processKvp(
            cipher,
            extraField.fieldName,
            extraField.data.content,
            extraField.type == "text" ? FieldType.Text : FieldType.Hidden
          );
        }

        this.convertToNoteIfNeeded(cipher);
        this.cleanupCipher(cipher);
        result.ciphers.push(cipher);
      }
    }

    result.success = true;
    return Promise.resolve(result);
  }
}
