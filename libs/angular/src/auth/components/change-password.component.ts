import { Directive, OnDestroy, OnInit } from "@angular/core";
import { Subject, firstValueFrom, map, takeUntil } from "rxjs";

import { PolicyService } from "@bitwarden/common/admin-console/abstractions/policy/policy.service.abstraction";
import { MasterPasswordPolicyOptions } from "@bitwarden/common/admin-console/models/domain/master-password-policy-options";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { KdfConfigService } from "@bitwarden/common/auth/abstractions/kdf-config.service";
import { InternalMasterPasswordServiceAbstraction } from "@bitwarden/common/auth/abstractions/master-password.service.abstraction";
import { KdfConfig } from "@bitwarden/common/auth/models/domain/kdf-config";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { MessagingService } from "@bitwarden/common/platform/abstractions/messaging.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { StateService } from "@bitwarden/common/platform/abstractions/state.service";
import { Utils } from "@bitwarden/common/platform/misc/utils";
import { EncString } from "@bitwarden/common/platform/models/domain/enc-string";
import { UserKey, MasterKey } from "@bitwarden/common/types/key";
import { DialogService, ToastService } from "@bitwarden/components";
import { PasswordGenerationServiceAbstraction } from "@bitwarden/generator-legacy";
import { KeyService } from "@bitwarden/key-management";

import { PasswordColorText } from "../../tools/password-strength/password-strength.component";

@Directive()
export class ChangePasswordComponent implements OnInit, OnDestroy {
  masterPassword: string;
  masterPasswordRetype: string;
  formPromise: Promise<any>;
  enforcedPolicyOptions: MasterPasswordPolicyOptions;
  passwordStrengthResult: any;
  color: string;
  text: string;
  leakedPassword: boolean;
  minimumLength = Utils.minimumPasswordLength;

  protected email: string;
  protected kdfConfig: KdfConfig;

  protected destroy$ = new Subject<void>();

  constructor(
    protected i18nService: I18nService,
    protected keyService: KeyService,
    protected messagingService: MessagingService,
    protected passwordGenerationService: PasswordGenerationServiceAbstraction,
    protected platformUtilsService: PlatformUtilsService,
    protected policyService: PolicyService,
    protected stateService: StateService,
    protected dialogService: DialogService,
    protected kdfConfigService: KdfConfigService,
    protected masterPasswordService: InternalMasterPasswordServiceAbstraction,
    protected accountService: AccountService,
    protected toastService: ToastService,
  ) {}

  async ngOnInit() {
    this.email = await firstValueFrom(
      this.accountService.activeAccount$.pipe(map((a) => a?.email)),
    );
    this.policyService
      .masterPasswordPolicyOptions$()
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        (enforcedPasswordPolicyOptions) =>
          (this.enforcedPolicyOptions ??= enforcedPasswordPolicyOptions),
      );

    if (this.enforcedPolicyOptions?.minLength) {
      this.minimumLength = this.enforcedPolicyOptions.minLength;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async submit() {
    if (!(await this.strongPassword())) {
      return;
    }

    if (!(await this.setupSubmitActions())) {
      return;
    }

    const email = await firstValueFrom(
      this.accountService.activeAccount$.pipe(map((a) => a?.email)),
    );
    if (this.kdfConfig == null) {
      this.kdfConfig = await this.kdfConfigService.getKdfConfig();
    }

    // Create new master key
    const newMasterKey = await this.keyService.makeMasterKey(
      this.masterPassword,
      email.trim().toLowerCase(),
      this.kdfConfig,
    );
    const newMasterKeyHash = await this.keyService.hashMasterKey(this.masterPassword, newMasterKey);

    let newProtectedUserKey: [UserKey, EncString] = null;
    const userKey = await this.keyService.getUserKey();
    if (userKey == null) {
      newProtectedUserKey = await this.keyService.makeUserKey(newMasterKey);
    } else {
      newProtectedUserKey = await this.keyService.encryptUserKeyWithMasterKey(newMasterKey);
    }

    await this.performSubmitActions(newMasterKeyHash, newMasterKey, newProtectedUserKey);
  }

  async setupSubmitActions(): Promise<boolean> {
    // Override in sub-class
    // Can be used for additional validation and/or other processes the should occur before changing passwords
    return true;
  }

  async performSubmitActions(
    newMasterKeyHash: string,
    newMasterKey: MasterKey,
    newUserKey: [UserKey, EncString],
  ) {
    // Override in sub-class
  }

  async strongPassword(): Promise<boolean> {
    if (this.masterPassword == null || this.masterPassword === "") {
      this.toastService.showToast({
        variant: "error",
        title: this.i18nService.t("errorOccurred"),
        message: this.i18nService.t("masterPasswordRequired"),
      });
      return false;
    }
    if (this.masterPassword.length < this.minimumLength) {
      this.toastService.showToast({
        variant: "error",
        title: this.i18nService.t("errorOccurred"),
        message: this.i18nService.t("masterPasswordMinimumlength", this.minimumLength),
      });
      return false;
    }
    if (this.masterPassword !== this.masterPasswordRetype) {
      this.toastService.showToast({
        variant: "error",
        title: this.i18nService.t("errorOccurred"),
        message: this.i18nService.t("masterPassDoesntMatch"),
      });
      return false;
    }

    const strengthResult = this.passwordStrengthResult;

    if (
      this.enforcedPolicyOptions != null &&
      !this.policyService.evaluateMasterPassword(
        strengthResult.score,
        this.masterPassword,
        this.enforcedPolicyOptions,
      )
    ) {
      this.toastService.showToast({
        variant: "error",
        title: this.i18nService.t("errorOccurred"),
        message: this.i18nService.t("masterPasswordPolicyRequirementsNotMet"),
      });
      return false;
    }

    const weakPassword = strengthResult != null && strengthResult.score < 3;

    if (weakPassword && this.leakedPassword) {
      const result = await this.dialogService.openSimpleDialog({
        title: { key: "weakAndExposedMasterPassword" },
        content: { key: "weakAndBreachedMasterPasswordDesc" },
        type: "warning",
      });

      if (!result) {
        return false;
      }
    } else {
      if (weakPassword) {
        const result = await this.dialogService.openSimpleDialog({
          title: { key: "weakMasterPassword" },
          content: { key: "weakMasterPasswordDesc" },
          type: "warning",
        });

        if (!result) {
          return false;
        }
      }
      if (this.leakedPassword) {
        const result = await this.dialogService.openSimpleDialog({
          title: { key: "exposedMasterPassword" },
          content: { key: "exposedMasterPasswordDesc" },
          type: "warning",
        });

        if (!result) {
          return false;
        }
      }
    }

    return true;
  }

  async logOut() {
    const confirmed = await this.dialogService.openSimpleDialog({
      title: { key: "logOut" },
      content: { key: "logOutConfirmation" },
      acceptButtonText: { key: "logOut" },
      type: "warning",
    });

    if (confirmed) {
      this.messagingService.send("logout");
    }
  }

  getStrengthResult(result: any) {
    this.passwordStrengthResult = result;
  }

  getPasswordScoreText(event: PasswordColorText) {
    this.color = event.color;
    this.text = event.text;
  }
}
