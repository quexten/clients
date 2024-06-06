import { Component, Input } from "@angular/core";
import { UntypedFormBuilder } from "@angular/forms";
import { Router } from "@angular/router";

import { RegisterComponent as BaseRegisterComponent } from "@bitwarden/angular/auth/components/register.component";
import { FormValidationErrorsService } from "@bitwarden/angular/platform/abstractions/form-validation-errors.service";
import { LoginStrategyServiceAbstraction } from "@bitwarden/auth/common";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { AuditService } from "@bitwarden/common/abstractions/audit.service";
import { PolicyService } from "@bitwarden/common/admin-console/abstractions/policy/policy.service.abstraction";
import { MasterPasswordPolicyOptions } from "@bitwarden/common/admin-console/models/domain/master-password-policy-options";
import { ReferenceEventRequest } from "@bitwarden/common/models/request/reference-event.request";
import { RegisterRequest } from "@bitwarden/common/models/request/register.request";
import { CryptoService } from "@bitwarden/common/platform/abstractions/crypto.service";
import { EnvironmentService } from "@bitwarden/common/platform/abstractions/environment.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { StateService } from "@bitwarden/common/platform/abstractions/state.service";
import { PasswordGenerationServiceAbstraction } from "@bitwarden/common/tools/generator/password";
import { DialogService } from "@bitwarden/components";

import { AcceptOrganizationInviteService } from "../organization-invite/accept-organization.service";

@Component({
  selector: "app-register-form",
  templateUrl: "./register-form.component.html",
})
export class RegisterFormComponent extends BaseRegisterComponent {
  @Input() queryParamEmail: string;
  @Input() queryParamFromOrgInvite: boolean;
  @Input() enforcedPolicyOptions: MasterPasswordPolicyOptions;
  @Input() referenceDataValue: ReferenceEventRequest;

  showErrorSummary = false;
  characterMinimumMessage: string;

  constructor(
    formValidationErrorService: FormValidationErrorsService,
    formBuilder: UntypedFormBuilder,
    loginStrategyService: LoginStrategyServiceAbstraction,
    router: Router,
    i18nService: I18nService,
    cryptoService: CryptoService,
    apiService: ApiService,
    stateService: StateService,
    platformUtilsService: PlatformUtilsService,
    passwordGenerationService: PasswordGenerationServiceAbstraction,
    private policyService: PolicyService,
    environmentService: EnvironmentService,
    logService: LogService,
    auditService: AuditService,
    dialogService: DialogService,
    acceptOrgInviteService: AcceptOrganizationInviteService,
  ) {
    super(
      formValidationErrorService,
      formBuilder,
      loginStrategyService,
      router,
      i18nService,
      cryptoService,
      apiService,
      stateService,
      platformUtilsService,
      passwordGenerationService,
      environmentService,
      logService,
      auditService,
      dialogService,
    );
    super.modifyRegisterRequest = async (request: RegisterRequest) => {
      // Org invites are deep linked. Non-existent accounts are redirected to the register page.
      // Org user id and token are included here only for validation and two factor purposes.
      const orgInvite = await acceptOrgInviteService.getOrganizationInvite();
      if (orgInvite != null) {
        request.organizationUserId = orgInvite.organizationUserId;
        request.token = orgInvite.token;
      }
      // Invite is accepted after login (on deep link redirect).
    };
  }

  async ngOnInit() {
    await super.ngOnInit();
    this.referenceData = this.referenceDataValue;
    if (this.queryParamEmail) {
      this.formGroup.get("email")?.setValue(this.queryParamEmail);
    }

    if (this.enforcedPolicyOptions != null && this.enforcedPolicyOptions.minLength > 0) {
      this.characterMinimumMessage = "";
    } else {
      this.characterMinimumMessage = this.i18nService.t("characterMinimum", this.minimumLength);
    }
  }

  async submit() {
    if (
      this.enforcedPolicyOptions != null &&
      !this.policyService.evaluateMasterPassword(
        this.passwordStrengthResult.score,
        this.formGroup.value.masterPassword,
        this.enforcedPolicyOptions,
      )
    ) {
      this.platformUtilsService.showToast(
        "error",
        this.i18nService.t("errorOccurred"),
        this.i18nService.t("masterPasswordPolicyRequirementsNotMet"),
      );
      return;
    }

    await super.submit(false);
  }
}
