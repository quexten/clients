import { ApiService } from "../../abstractions/api.service";
import { BillingApiServiceAbstraction } from "../../billing/abstractions";
import { PaymentMethodType } from "../../billing/enums";
import { ExpandedTaxInfoUpdateRequest } from "../../billing/models/request/expanded-tax-info-update.request";
import { SubscriptionCancellationRequest } from "../../billing/models/request/subscription-cancellation.request";
import { TokenizedPaymentMethodRequest } from "../../billing/models/request/tokenized-payment-method.request";
import { VerifyBankAccountRequest } from "../../billing/models/request/verify-bank-account.request";
import { OrganizationBillingMetadataResponse } from "../../billing/models/response/organization-billing-metadata.response";
import { OrganizationBillingStatusResponse } from "../../billing/models/response/organization-billing-status.response";
import { OrganizationSubscriptionResponse } from "../../billing/models/response/organization-subscription.response";
import { PaymentInformationResponse } from "../../billing/models/response/payment-information.response";
import { PlanResponse } from "../../billing/models/response/plan.response";
import { ListResponse } from "../../models/response/list.response";
import { CreateClientOrganizationRequest } from "../models/request/create-client-organization.request";
import { UpdateClientOrganizationRequest } from "../models/request/update-client-organization.request";
import { ProviderSubscriptionResponse } from "../models/response/provider-subscription-response";

export class BillingApiService implements BillingApiServiceAbstraction {
  constructor(private apiService: ApiService) {}

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

  createClientOrganization(
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

  async getBillingStatus(id: string): Promise<OrganizationBillingStatusResponse> {
    const r = await this.apiService.send(
      "GET",
      "/organizations/" + id + "/billing-status",
      null,
      true,
      true,
    );
    return new OrganizationBillingStatusResponse(r);
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

  async getOrganizationSubscription(
    organizationId: string,
  ): Promise<OrganizationSubscriptionResponse> {
    const r = await this.apiService.send(
      "GET",
      "/organizations/" + organizationId + "/subscription",
      null,
      true,
      true,
    );
    return new OrganizationSubscriptionResponse(r);
  }

  async getPlans(): Promise<ListResponse<PlanResponse>> {
    const r = await this.apiService.send("GET", "/plans", null, false, true);
    return new ListResponse(r, PlanResponse);
  }

  async getProviderPaymentInformation(providerId: string): Promise<PaymentInformationResponse> {
    const response = await this.apiService.send(
      "GET",
      "/providers/" + providerId + "/billing/payment-information",
      null,
      true,
      true,
    );
    return new PaymentInformationResponse(response);
  }

  async getProviderSubscription(providerId: string): Promise<ProviderSubscriptionResponse> {
    const r = await this.apiService.send(
      "GET",
      "/providers/" + providerId + "/billing/subscription",
      null,
      true,
      true,
    );
    return new ProviderSubscriptionResponse(r);
  }

  async updateClientOrganization(
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

  async updateProviderPaymentMethod(
    providerId: string,
    request: TokenizedPaymentMethodRequest,
  ): Promise<void> {
    return await this.apiService.send(
      "PUT",
      "/providers/" + providerId + "/billing/payment-method",
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

  async verifyProviderBankAccount(providerId: string, request: VerifyBankAccountRequest) {
    return await this.apiService.send(
      "POST",
      "/providers/" + providerId + "/billing/payment-method/verify-bank-account",
      request,
      true,
      false,
    );
  }
}
