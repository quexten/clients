import { DialogRef } from "@angular/cdk/dialog";
import { Component, OnDestroy, OnInit, Type, ViewChild, ViewContainerRef } from "@angular/core";
import { firstValueFrom, lastValueFrom, Observable, Subject, takeUntil } from "rxjs";

import { ModalRef } from "@bitwarden/angular/components/modal/modal.ref";
import { ModalService } from "@bitwarden/angular/services/modal.service";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { PolicyService } from "@bitwarden/common/admin-console/abstractions/policy/policy.service.abstraction";
import { PolicyType } from "@bitwarden/common/admin-console/enums";
import { Organization } from "@bitwarden/common/admin-console/models/domain/organization";
import { TwoFactorProviderType } from "@bitwarden/common/auth/enums/two-factor-provider-type";
import { TwoFactorAuthenticatorResponse } from "@bitwarden/common/auth/models/response/two-factor-authenticator.response";
import { TwoFactorDuoResponse } from "@bitwarden/common/auth/models/response/two-factor-duo.response";
import { TwoFactorEmailResponse } from "@bitwarden/common/auth/models/response/two-factor-email.response";
import { TwoFactorWebAuthnResponse } from "@bitwarden/common/auth/models/response/two-factor-web-authn.response";
import { TwoFactorYubiKeyResponse } from "@bitwarden/common/auth/models/response/two-factor-yubi-key.response";
import { TwoFactorProviders } from "@bitwarden/common/auth/services/two-factor.service";
import { AuthResponse } from "@bitwarden/common/auth/types/auth-response";
import { BillingAccountProfileStateService } from "@bitwarden/common/billing/abstractions/account/billing-account-profile-state.service";
import { ProductType } from "@bitwarden/common/enums";
import { MessagingService } from "@bitwarden/common/platform/abstractions/messaging.service";
import { DialogService } from "@bitwarden/components";

import { TwoFactorAuthenticatorComponent } from "./two-factor-authenticator.component";
import { TwoFactorDuoComponent } from "./two-factor-duo.component";
import { TwoFactorEmailComponent } from "./two-factor-email.component";
import { TwoFactorRecoveryComponent } from "./two-factor-recovery.component";
import { TwoFactorVerifyComponent } from "./two-factor-verify.component";
import { TwoFactorWebAuthnComponent } from "./two-factor-webauthn.component";
import { TwoFactorYubiKeyComponent } from "./two-factor-yubikey.component";

@Component({
  selector: "app-two-factor-setup",
  templateUrl: "two-factor-setup.component.html",
})
export class TwoFactorSetupComponent implements OnInit, OnDestroy {
  @ViewChild("yubikeyTemplate", { read: ViewContainerRef, static: true })
  yubikeyModalRef: ViewContainerRef;
  @ViewChild("duoTemplate", { read: ViewContainerRef, static: true }) duoModalRef: ViewContainerRef;
  @ViewChild("emailTemplate", { read: ViewContainerRef, static: true })
  emailModalRef: ViewContainerRef;
  @ViewChild("webAuthnTemplate", { read: ViewContainerRef, static: true })
  webAuthnModalRef: ViewContainerRef;

  organizationId: string;
  organization: Organization;
  providers: any[] = [];
  canAccessPremium$: Observable<boolean>;
  showPolicyWarning = false;
  loading = true;
  modal: ModalRef;
  formPromise: Promise<any>;

  tabbedHeader = true;

  protected destroy$ = new Subject<void>();
  private twoFactorAuthPolicyAppliesToActiveUser: boolean;

  constructor(
    protected dialogService: DialogService,
    protected apiService: ApiService,
    protected modalService: ModalService,
    protected messagingService: MessagingService,
    protected policyService: PolicyService,
    billingAccountProfileStateService: BillingAccountProfileStateService,
  ) {
    this.canAccessPremium$ = billingAccountProfileStateService.hasPremiumFromAnySource$;
  }

  async ngOnInit() {
    for (const key in TwoFactorProviders) {
      // eslint-disable-next-line
      if (!TwoFactorProviders.hasOwnProperty(key)) {
        continue;
      }

      const p = (TwoFactorProviders as any)[key];
      if (this.filterProvider(p.type)) {
        continue;
      }

      this.providers.push({
        type: p.type,
        name: p.name,
        description: p.description,
        enabled: false,
        premium: p.premium,
        sort: p.sort,
      });
    }

    this.providers.sort((a: any, b: any) => a.sort - b.sort);

    this.policyService
      .policyAppliesToActiveUser$(PolicyType.TwoFactorAuthentication)
      .pipe(takeUntil(this.destroy$))
      .subscribe((policyAppliesToActiveUser) => {
        this.twoFactorAuthPolicyAppliesToActiveUser = policyAppliesToActiveUser;
      });

    await this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async load() {
    this.loading = true;
    const providerList = await this.getTwoFactorProviders();
    providerList.data.forEach((p) => {
      this.providers.forEach((p2) => {
        if (p.type === p2.type) {
          p2.enabled = p.enabled;
        }
      });
    });
    this.evaluatePolicies();
    this.loading = false;
  }

  async callTwoFactorVerifyDialog(type?: TwoFactorProviderType) {
    const twoFactorVerifyDialogRef = TwoFactorVerifyComponent.open(this.dialogService, {
      data: { type: type, organizationId: this.organizationId },
    });
    return await lastValueFrom(twoFactorVerifyDialogRef.closed);
  }

  async manage(type: TwoFactorProviderType) {
    switch (type) {
      case TwoFactorProviderType.Authenticator: {
        const result: AuthResponse<TwoFactorAuthenticatorResponse> =
          await this.callTwoFactorVerifyDialog(type);
        if (!result) {
          return;
        }
        const authComp: DialogRef<boolean, any> = TwoFactorAuthenticatorComponent.open(
          this.dialogService,
          { data: result },
        );
        authComp.componentInstance.onChangeStatus.subscribe((enabled: boolean) => {
          this.updateStatus(enabled, TwoFactorProviderType.Authenticator);
        });
        break;
      }
      case TwoFactorProviderType.Yubikey: {
        const result: AuthResponse<TwoFactorYubiKeyResponse> =
          await this.callTwoFactorVerifyDialog(type);
        if (!result) {
          return;
        }
        const yubiComp = await this.openModal(this.yubikeyModalRef, TwoFactorYubiKeyComponent);
        yubiComp.auth(result);
        yubiComp.onUpdated.pipe(takeUntil(this.destroy$)).subscribe((enabled: boolean) => {
          this.updateStatus(enabled, TwoFactorProviderType.Yubikey);
        });
        break;
      }
      case TwoFactorProviderType.Duo: {
        const result: AuthResponse<TwoFactorDuoResponse> =
          await this.callTwoFactorVerifyDialog(type);
        if (!result) {
          return;
        }
        const duoComp = await this.openModal(this.duoModalRef, TwoFactorDuoComponent);
        duoComp.auth(result);
        duoComp.onUpdated.pipe(takeUntil(this.destroy$)).subscribe((enabled: boolean) => {
          this.updateStatus(enabled, TwoFactorProviderType.Duo);
        });
        break;
      }
      case TwoFactorProviderType.Email: {
        const result: AuthResponse<TwoFactorEmailResponse> =
          await this.callTwoFactorVerifyDialog(type);
        if (!result) {
          return;
        }
        const authComp: DialogRef<boolean, any> = TwoFactorEmailComponent.open(this.dialogService, {
          data: result,
        });
        authComp.componentInstance.onChangeStatus
          .pipe(takeUntil(this.destroy$))
          .subscribe((enabled: boolean) => {
            this.updateStatus(enabled, TwoFactorProviderType.Email);
          });
        break;
      }
      case TwoFactorProviderType.WebAuthn: {
        const result: AuthResponse<TwoFactorWebAuthnResponse> =
          await this.callTwoFactorVerifyDialog(type);
        if (!result) {
          return;
        }
        const webAuthnComp = await this.openModal(
          this.webAuthnModalRef,
          TwoFactorWebAuthnComponent,
        );
        webAuthnComp.auth(result);
        webAuthnComp.onUpdated.pipe(takeUntil(this.destroy$)).subscribe((enabled: boolean) => {
          this.updateStatus(enabled, TwoFactorProviderType.WebAuthn);
        });
        break;
      }
      default:
        break;
    }
  }

  async recoveryCode() {
    const result = await this.callTwoFactorVerifyDialog(-1 as TwoFactorProviderType);
    if (result) {
      const recoverComp = TwoFactorRecoveryComponent.open(this.dialogService, { data: result });
      await lastValueFrom(recoverComp.closed);
    }
  }

  async premiumRequired() {
    if (!(await firstValueFrom(this.canAccessPremium$))) {
      this.messagingService.send("premiumRequired");
      return;
    }
  }

  protected getTwoFactorProviders() {
    return this.apiService.getTwoFactorProviders();
  }

  protected filterProvider(type: TwoFactorProviderType) {
    return type === TwoFactorProviderType.OrganizationDuo;
  }

  protected async openModal<T>(ref: ViewContainerRef, type: Type<T>): Promise<T> {
    const [modal, childComponent] = await this.modalService.openViewRef(type, ref);
    this.modal = modal;

    return childComponent;
  }

  protected updateStatus(enabled: boolean, type: TwoFactorProviderType) {
    if (!enabled && this.modal != null) {
      this.modal.close();
    }
    this.providers.forEach((p) => {
      if (p.type === type) {
        p.enabled = enabled;
      }
    });
    this.evaluatePolicies();
  }

  private evaluatePolicies() {
    if (this.organizationId == null && this.providers.filter((p) => p.enabled).length === 1) {
      this.showPolicyWarning = this.twoFactorAuthPolicyAppliesToActiveUser;
    } else {
      this.showPolicyWarning = false;
    }
  }

  get isEnterpriseOrg() {
    return this.organization?.planProductType === ProductType.Enterprise;
  }
}
