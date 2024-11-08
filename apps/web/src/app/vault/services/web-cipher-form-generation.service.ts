import { inject, Injectable } from "@angular/core";
import { firstValueFrom } from "rxjs";

import { DialogService } from "@bitwarden/components";
import { CipherFormGenerationService } from "@bitwarden/vault";

import { WebVaultGeneratorDialogComponent } from "../components/web-generator-dialog/web-generator-dialog.component";

@Injectable()
export class WebCipherFormGenerationService implements CipherFormGenerationService {
  private dialogService = inject(DialogService);

  async generatePassword(): Promise<string> {
    const dialogRef = WebVaultGeneratorDialogComponent.open(this.dialogService, {
      data: { type: "password" },
    });

    const result = await firstValueFrom(dialogRef.closed);

    if (result == null || result.action === "canceled") {
      return null;
    }

    return result.generatedValue;
  }

  async generateUsername(): Promise<string> {
    const dialogRef = WebVaultGeneratorDialogComponent.open(this.dialogService, {
      data: { type: "username" },
    });

    const result = await firstValueFrom(dialogRef.closed);

    if (result == null || result.action === "canceled") {
      return null;
    }

    return result.generatedValue;
  }
}
