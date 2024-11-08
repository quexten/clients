import { ProviderOrganizationOrganizationDetailsResponse } from "@bitwarden/common/admin-console/models/response/provider/provider-organization.response";
import { UpdatePaymentMethodRequest } from "@bitwarden/common/billing/models/request/update-payment-method.request";
import { VerifyBankAccountRequest } from "@bitwarden/common/billing/models/request/verify-bank-account.request";
import { InvoicesResponse } from "@bitwarden/common/billing/models/response/invoices.response";
import { PaymentMethodResponse } from "@bitwarden/common/billing/models/response/payment-method.response";
import { ErrorResponse } from "@bitwarden/common/models/response/error.response";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { ToastService } from "@bitwarden/components";

import { ApiService } from "../../abstractions/api.service";
import { BillingApiServiceAbstraction } from "../../billing/abstractions";
import { PaymentMethodType } from "../../billing/enums";
import { ExpandedTaxInfoUpdateRequest } from "../../billing/models/request/expanded-tax-info-update.request";
import { SubscriptionCancellationRequest } from "../../billing/models/request/subscription-cancellation.request";
import { OrganizationBillingMetadataResponse } from "../../billing/models/response/organization-billing-metadata.response";
import { PlanResponse } from "../../billing/models/response/plan.response";
import { ListResponse } from "../../models/response/list.response";
import { CreateClientOrganizationRequest } from "../models/request/create-client-organization.request";
import { UpdateClientOrganizationRequest } from "../models/request/update-client-organization.request";
import { ProviderSubscriptionResponse } from "../models/response/provider-subscription-response";

export class BillingApiService implements BillingApiServiceAbstraction {
  constructor(
    private apiService: ApiService,
    private logService: LogService,
    private toastService: ToastService,
  ) {}

  cancelOrganizationSubscription(
    organizationId: string,
    request: SubscriptionCancellationRequest,
  ): Promise<void> {
    return this.apiService.send(
      "POST",
      "/organizations/" + organizationId + "/cancel",
      request,
      true,
      false,
    );
  }

  cancelPremiumUserSubscription(request: SubscriptionCancellationRequest): Promise<void> {
    return this.apiService.send("POST", "/accounts/cancel", request, true, false);
  }

  createProviderClientOrganization(
    providerId: string,
    request: CreateClientOrganizationRequest,
  ): Promise<void> {
    return this.apiService.send(
      "POST",
      "/providers/" + providerId + "/clients",
      request,
      true,
      false,
    );
  }

  async createSetupIntent(type: PaymentMethodType) {
    const getPath = () => {
      switch (type) {
        case PaymentMethodType.BankAccount: {
          return "/setup-intent/bank-account";
        }
        case PaymentMethodType.Card: {
          return "/setup-intent/card";
        }
      }
    };
    const response = await this.apiService.send("POST", getPath(), null, true, true);
    return response as string;
  }

  async getOrganizationBillingMetadata(
    organizationId: string,
  ): Promise<OrganizationBillingMetadataResponse> {
    const r = await this.apiService.send(
      "GET",
      "/organizations/" + organizationId + "/billing/metadata",
      null,
      true,
      true,
    );

    return new OrganizationBillingMetadataResponse(r);
  }

  async getOrganizationPaymentMethod(organizationId: string): Promise<PaymentMethodResponse> {
    const response = await this.execute(() =>
      this.apiService.send(
        "GET",
        "/organizations/" + organizationId + "/billing/payment-method",
        null,
        true,
        true,
      ),
    );
    return new PaymentMethodResponse(response);
  }

  async getPlans(): Promise<ListResponse<PlanResponse>> {
    const r = await this.apiService.send("GET", "/plans", null, false, true);
    return new ListResponse(r, PlanResponse);
  }

  async getProviderClientInvoiceReport(providerId: string, invoiceId: string): Promise<string> {
    const response = await this.apiService.send(
      "GET",
      "/providers/" + providerId + "/billing/invoices/" + invoiceId,
      null,
      true,
      true,
    );
    return response as string;
  }

  async getProviderClientOrganizations(
    providerId: string,
  ): Promise<ListResponse<ProviderOrganizationOrganizationDetailsResponse>> {
    const response = await this.execute(() =>
      this.apiService.send("GET", "/providers/" + providerId + "/organizations", null, true, true),
    );
    return new ListResponse(response, ProviderOrganizationOrganizationDetailsResponse);
  }

  async getProviderInvoices(providerId: string): Promise<InvoicesResponse> {
    const response = await this.execute(() =>
      this.apiService.send(
        "GET",
        "/providers/" + providerId + "/billing/invoices",
        null,
        true,
        true,
      ),
    );
    return new InvoicesResponse(response);
  }

  async getProviderSubscription(providerId: string): Promise<ProviderSubscriptionResponse> {
    const response = await this.execute(() =>
      this.apiService.send(
        "GET",
        "/providers/" + providerId + "/billing/subscription",
        null,
        true,
        true,
      ),
    );
    return new ProviderSubscriptionResponse(response);
  }

  async updateOrganizationPaymentMethod(
    organizationId: string,
    request: UpdatePaymentMethodRequest,
  ): Promise<void> {
    return await this.apiService.send(
      "PUT",
      "/organizations/" + organizationId + "/billing/payment-method",
      request,
      true,
      false,
    );
  }

  async updateOrganizationTaxInformation(
    organizationId: string,
    request: ExpandedTaxInfoUpdateRequest,
  ): Promise<void> {
    return await this.apiService.send(
      "PUT",
      "/organizations/" + organizationId + "/billing/tax-information",
      request,
      true,
      false,
    );
  }

  async updateProviderClientOrganization(
    providerId: string,
    organizationId: string,
    request: UpdateClientOrganizationRequest,
  ): Promise<any> {
    return await this.apiService.send(
      "PUT",
      "/providers/" + providerId + "/clients/" + organizationId,
      request,
      true,
      false,
    );
  }

  async updateProviderTaxInformation(providerId: string, request: ExpandedTaxInfoUpdateRequest) {
    return await this.apiService.send(
      "PUT",
      "/providers/" + providerId + "/billing/tax-information",
      request,
      true,
      false,
    );
  }

  async verifyOrganizationBankAccount(
    organizationId: string,
    request: VerifyBankAccountRequest,
  ): Promise<void> {
    return await this.apiService.send(
      "POST",
      "/organizations/" + organizationId + "/billing/payment-method/verify-bank-account",
      request,
      true,
      false,
    );
  }

  private async execute(request: () => Promise<any>): Promise<any> {
    try {
      return await request();
    } catch (error) {
      this.logService.error(error);
      if (error instanceof ErrorResponse) {
        this.toastService.showToast({
          variant: "error",
          title: null,
          message: error.getSingleMessage(),
        });
      }
      throw error;
    }
  }
}
