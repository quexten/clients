import { Component, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { FormBuilder, Validators } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { firstValueFrom, Subject, switchMap } from "rxjs";
import { first, takeUntil } from "rxjs/operators";

import { ManageTaxInformationComponent } from "@bitwarden/angular/billing/components";
import { ProviderApiServiceAbstraction } from "@bitwarden/common/admin-console/abstractions/provider/provider-api.service.abstraction";
import { ProviderSetupRequest } from "@bitwarden/common/admin-console/models/request/provider/provider-setup.request";
import { ExpandedTaxInfoUpdateRequest } from "@bitwarden/common/billing/models/request/expanded-tax-info-update.request";
import { FeatureFlag } from "@bitwarden/common/enums/feature-flag.enum";
import { ConfigService } from "@bitwarden/common/platform/abstractions/config/config.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { ValidationService } from "@bitwarden/common/platform/abstractions/validation.service";
import { ProviderKey } from "@bitwarden/common/types/key";
import { SyncService } from "@bitwarden/common/vault/abstractions/sync/sync.service.abstraction";
import { ToastService } from "@bitwarden/components";
import { KeyService } from "@bitwarden/key-management";

@Component({
  selector: "provider-setup",
  templateUrl: "setup.component.html",
})
export class SetupComponent implements OnInit, OnDestroy {
  @ViewChild(ManageTaxInformationComponent)
  manageTaxInformationComponent: ManageTaxInformationComponent;

  loading = true;
  providerId: string;
  token: string;

  protected formGroup = this.formBuilder.group({
    name: ["", Validators.required],
    billingEmail: ["", [Validators.required, Validators.email]],
  });

  protected enableConsolidatedBilling$ = this.configService.getFeatureFlag$(
    FeatureFlag.EnableConsolidatedBilling,
  );

  private destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private i18nService: I18nService,
    private route: ActivatedRoute,
    private keyService: KeyService,
    private syncService: SyncService,
    private validationService: ValidationService,
    private configService: ConfigService,
    private providerApiService: ProviderApiServiceAbstraction,
    private formBuilder: FormBuilder,
    private toastService: ToastService,
  ) {}

  ngOnInit() {
    document.body.classList.remove("layout_frontend");

    this.route.queryParams
      .pipe(
        first(),
        switchMap(async (queryParams) => {
          const error =
            queryParams.providerId == null ||
            queryParams.email == null ||
            queryParams.token == null;

          if (error) {
            this.toastService.showToast({
              variant: "error",
              title: null,
              message: this.i18nService.t("emergencyInviteAcceptFailed"),
              timeout: 10000,
            });

            return await this.router.navigate(["/"]);
          }

          this.providerId = queryParams.providerId;
          this.token = queryParams.token;

          try {
            const provider = await this.providerApiService.getProvider(this.providerId);

            if (provider.name != null) {
              /*
                This is currently always going to result in a redirect to the Vault because the `provider-permissions.guard`
                checks for the existence of the Provider in state. However, when accessing the Setup page via the email link,
                this `navigate` invocation will be hit before the sync can complete, thus resulting in a null Provider. If we want
                to resolve it, we'd either need to use the ProviderApiService in the provider-permissions.guard (added expense)
                or somehow check that the previous route was /setup.
              */
              return await this.router.navigate(["/providers", provider.id], {
                replaceUrl: true,
              });
            }
            this.loading = false;
          } catch (error) {
            this.validationService.showError(error);
            return await this.router.navigate(["/"]);
          }
        }),
        takeUntil(this.destroy$),
      )
      .subscribe();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  submit = async () => {
    try {
      const consolidatedBillingEnabled = await firstValueFrom(this.enableConsolidatedBilling$);

      this.formGroup.markAllAsTouched();

      const formIsValid = consolidatedBillingEnabled
        ? this.formGroup.valid && this.manageTaxInformationComponent.touch()
        : this.formGroup.valid;

      if (!formIsValid) {
        return;
      }

      const providerKey = await this.keyService.makeOrgKey<ProviderKey>();
      const key = providerKey[0].encryptedString;

      const request = new ProviderSetupRequest();
      request.name = this.formGroup.value.name;
      request.billingEmail = this.formGroup.value.billingEmail;
      request.token = this.token;
      request.key = key;

      if (consolidatedBillingEnabled) {
        request.taxInfo = new ExpandedTaxInfoUpdateRequest();
        const taxInformation = this.manageTaxInformationComponent.getTaxInformation();

        request.taxInfo.country = taxInformation.country;
        request.taxInfo.postalCode = taxInformation.postalCode;
        if (taxInformation.includeTaxId) {
          request.taxInfo.taxId = taxInformation.taxId;
          request.taxInfo.line1 = taxInformation.line1;
          request.taxInfo.line2 = taxInformation.line2;
          request.taxInfo.city = taxInformation.city;
          request.taxInfo.state = taxInformation.state;
        }
      }

      const provider = await this.providerApiService.postProviderSetup(this.providerId, request);

      this.toastService.showToast({
        variant: "success",
        title: null,
        message: this.i18nService.t("providerSetup"),
      });

      await this.syncService.fullSync(true);

      await this.router.navigate(["/providers", provider.id]);
    } catch (e) {
      this.validationService.showError(e);
    }
  };
}
