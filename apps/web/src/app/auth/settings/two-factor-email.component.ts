import { DIALOG_DATA, DialogConfig, DialogRef } from "@angular/cdk/dialog";
import { Component, EventEmitter, Inject, Output } from "@angular/core";
import { FormBuilder, Validators } from "@angular/forms";
import { firstValueFrom, map } from "rxjs";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { UserVerificationService } from "@bitwarden/common/auth/abstractions/user-verification/user-verification.service.abstraction";
import { TwoFactorProviderType } from "@bitwarden/common/auth/enums/two-factor-provider-type";
import { TwoFactorEmailRequest } from "@bitwarden/common/auth/models/request/two-factor-email.request";
import { UpdateTwoFactorEmailRequest } from "@bitwarden/common/auth/models/request/update-two-factor-email.request";
import { TwoFactorEmailResponse } from "@bitwarden/common/auth/models/response/two-factor-email.response";
import { AuthResponse } from "@bitwarden/common/auth/types/auth-response";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { DialogService } from "@bitwarden/components";

import { TwoFactorBaseComponent } from "./two-factor-base.component";

@Component({
  selector: "app-two-factor-email",
  templateUrl: "two-factor-email.component.html",
  outputs: ["onUpdated"],
})
export class TwoFactorEmailComponent extends TwoFactorBaseComponent {
  @Output() onChangeStatus: EventEmitter<boolean> = new EventEmitter();
  type = TwoFactorProviderType.Email;
  sentEmail: string;
  formPromise: Promise<TwoFactorEmailResponse>;
  emailPromise: Promise<unknown>;
  override componentName = "app-two-factor-email";
  formGroup = this.formBuilder.group({
    token: [null],
    email: ["", [Validators.email, Validators.required]],
  });

  constructor(
    @Inject(DIALOG_DATA) protected data: AuthResponse<TwoFactorEmailResponse>,
    apiService: ApiService,
    i18nService: I18nService,
    platformUtilsService: PlatformUtilsService,
    logService: LogService,
    userVerificationService: UserVerificationService,
    private accountService: AccountService,
    dialogService: DialogService,
    private formBuilder: FormBuilder,
    private dialogRef: DialogRef,
  ) {
    super(
      apiService,
      i18nService,
      platformUtilsService,
      logService,
      userVerificationService,
      dialogService,
    );
  }
  get token() {
    return this.formGroup.get("token").value;
  }
  set token(value: string) {
    this.formGroup.get("token").setValue(value);
  }
  get email() {
    return this.formGroup.get("email").value;
  }
  set email(value: string) {
    this.formGroup.get("email").setValue(value);
  }

  async ngOnInit() {
    await this.auth(this.data);
  }

  auth(authResponse: AuthResponse<TwoFactorEmailResponse>) {
    super.auth(authResponse);
    return this.processResponse(authResponse.response);
  }

  submit = async () => {
    if (this.enabled) {
      await this.disableEmail();
      this.onChangeStatus.emit(false);
    } else {
      await this.enable();
      this.onChangeStatus.emit(true);
    }
  };

  private disableEmail() {
    return super.disable(this.formPromise);
  }

  sendEmail = async () => {
    const request = await this.buildRequestModel(TwoFactorEmailRequest);
    request.email = this.email;
    this.emailPromise = this.apiService.postTwoFactorEmailSetup(request);
    await this.emailPromise;
    this.sentEmail = this.email;
  };

  protected async enable() {
    const request = await this.buildRequestModel(UpdateTwoFactorEmailRequest);
    request.email = this.email;
    request.token = this.token;

    return super.enable(async () => {
      this.formPromise = this.apiService.putTwoFactorEmail(request);
      const response = await this.formPromise;
      await this.processResponse(response);
    });
  }

  onClose = () => {
    this.dialogRef.close(this.enabled);
  };

  private async processResponse(response: TwoFactorEmailResponse) {
    this.token = null;
    this.email = response.email;
    this.enabled = response.enabled;
    if (!this.enabled && (this.email == null || this.email === "")) {
      this.email = await firstValueFrom(
        this.accountService.activeAccount$.pipe(map((a) => a?.email)),
      );
    }
  }
  /**
   * Strongly typed helper to open a TwoFactorEmailComponentComponent
   * @param dialogService Instance of the dialog service that will be used to open the dialog
   * @param config Configuration for the dialog
   */
  static open(
    dialogService: DialogService,
    config: DialogConfig<AuthResponse<TwoFactorEmailResponse>>,
  ) {
    return dialogService.open<boolean>(TwoFactorEmailComponent, config);
  }
}
