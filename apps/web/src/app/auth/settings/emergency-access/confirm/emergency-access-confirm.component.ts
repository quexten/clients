import { DialogConfig, DialogRef, DIALOG_DATA } from "@angular/cdk/dialog";
import { Component, OnInit, Inject } from "@angular/core";
import { FormBuilder } from "@angular/forms";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { OrganizationManagementPreferencesService } from "@bitwarden/common/admin-console/abstractions/organization-management-preferences/organization-management-preferences.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { Utils } from "@bitwarden/common/platform/misc/utils";
import { DialogService } from "@bitwarden/components";
import { KeyService } from "@bitwarden/key-management";

export enum EmergencyAccessConfirmDialogResult {
  Confirmed = "confirmed",
}
type EmergencyAccessConfirmDialogData = {
  /** display name of the account requesting emergency access */
  name: string;
  /** identifies the account requesting emergency access */
  userId: string;
  /** traces a unique emergency request  */
  emergencyAccessId: string;
};
@Component({
  selector: "emergency-access-confirm",
  templateUrl: "emergency-access-confirm.component.html",
})
export class EmergencyAccessConfirmComponent implements OnInit {
  loading = true;
  fingerprint: string;
  confirmForm = this.formBuilder.group({
    dontAskAgain: [false],
  });

  constructor(
    @Inject(DIALOG_DATA) protected params: EmergencyAccessConfirmDialogData,
    private formBuilder: FormBuilder,
    private apiService: ApiService,
    private keyService: KeyService,
    protected organizationManagementPreferencesService: OrganizationManagementPreferencesService,
    private logService: LogService,
    private dialogRef: DialogRef<EmergencyAccessConfirmDialogResult>,
  ) {}

  async ngOnInit() {
    try {
      const publicKeyResponse = await this.apiService.getUserPublicKey(this.params.userId);
      if (publicKeyResponse != null) {
        const publicKey = Utils.fromB64ToArray(publicKeyResponse.publicKey);
        const fingerprint = await this.keyService.getFingerprint(this.params.userId, publicKey);
        if (fingerprint != null) {
          this.fingerprint = fingerprint.join("-");
        }
      }
    } catch (e) {
      this.logService.error(e);
    }
    this.loading = false;
  }

  submit = async () => {
    if (this.loading) {
      return;
    }

    if (this.confirmForm.get("dontAskAgain").value) {
      await this.organizationManagementPreferencesService.autoConfirmFingerPrints.set(true);
    }

    try {
      this.dialogRef.close(EmergencyAccessConfirmDialogResult.Confirmed);
    } catch (e) {
      this.logService.error(e);
    }
  };
  /**
   * Strongly typed helper to open a EmergencyAccessConfirmComponent
   * @param dialogService Instance of the dialog service that will be used to open the dialog
   * @param config Configuration for the dialog
   */
  static open(
    dialogService: DialogService,
    config: DialogConfig<EmergencyAccessConfirmDialogData>,
  ) {
    return dialogService.open<EmergencyAccessConfirmDialogResult>(
      EmergencyAccessConfirmComponent,
      config,
    );
  }
}
