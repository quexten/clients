import { PaymentMethodType } from "@bitwarden/common/billing/enums";
import { ExpandedTaxInfoUpdateRequest } from "@bitwarden/common/billing/models/request/expanded-tax-info-update.request";
import { TokenizedPaymentMethodRequest } from "@bitwarden/common/billing/models/request/tokenized-payment-method.request";
import { VerifyBankAccountRequest } from "@bitwarden/common/billing/models/request/verify-bank-account.request";
import { PaymentInformationResponse } from "@bitwarden/common/billing/models/response/payment-information.response";

import { SubscriptionCancellationRequest } from "../../billing/models/request/subscription-cancellation.request";
import { OrganizationBillingMetadataResponse } from "../../billing/models/response/organization-billing-metadata.response";
import { OrganizationBillingStatusResponse } from "../../billing/models/response/organization-billing-status.response";
import { OrganizationSubscriptionResponse } from "../../billing/models/response/organization-subscription.response";
import { PlanResponse } from "../../billing/models/response/plan.response";
import { ListResponse } from "../../models/response/list.response";
import { CreateClientOrganizationRequest } from "../models/request/create-client-organization.request";
import { UpdateClientOrganizationRequest } from "../models/request/update-client-organization.request";
import { ProviderSubscriptionResponse } from "../models/response/provider-subscription-response";

export abstract class BillingApiServiceAbstraction {
  cancelOrganizationSubscription: (
    organizationId: string,
    request: SubscriptionCancellationRequest,
  ) => Promise<void>;

  cancelPremiumUserSubscription: (request: SubscriptionCancellationRequest) => Promise<void>;

  createClientOrganization: (
    providerId: string,
    request: CreateClientOrganizationRequest,
  ) => Promise<void>;

  createSetupIntent: (paymentMethodType: PaymentMethodType) => Promise<string>;

  getBillingStatus: (id: string) => Promise<OrganizationBillingStatusResponse>;

  getOrganizationBillingMetadata: (
    organizationId: string,
  ) => Promise<OrganizationBillingMetadataResponse>;

  getOrganizationSubscription: (
    organizationId: string,
  ) => Promise<OrganizationSubscriptionResponse>;

  getPlans: () => Promise<ListResponse<PlanResponse>>;

  getProviderPaymentInformation: (providerId: string) => Promise<PaymentInformationResponse>;

  getProviderSubscription: (providerId: string) => Promise<ProviderSubscriptionResponse>;

  updateClientOrganization: (
    providerId: string,
    organizationId: string,
    request: UpdateClientOrganizationRequest,
  ) => Promise<any>;

  updateProviderPaymentMethod: (
    providerId: string,
    request: TokenizedPaymentMethodRequest,
  ) => Promise<void>;

  updateProviderTaxInformation: (
    providerId: string,
    request: ExpandedTaxInfoUpdateRequest,
  ) => Promise<void>;

  verifyProviderBankAccount: (
    providerId: string,
    request: VerifyBankAccountRequest,
  ) => Promise<void>;
}
