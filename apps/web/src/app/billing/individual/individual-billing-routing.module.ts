import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";

import { featureFlaggedRoute } from "@bitwarden/angular/platform/utils/feature-flagged-route";
import { FeatureFlag } from "@bitwarden/common/enums/feature-flag.enum";

import { PaymentMethodComponent } from "../shared";

import { BillingHistoryViewComponent } from "./billing-history-view.component";
import { PremiumV2Component } from "./premium/premium-v2.component";
import { PremiumComponent } from "./premium/premium.component";
import { SubscriptionComponent } from "./subscription.component";
import { UserSubscriptionComponent } from "./user-subscription.component";

const routes: Routes = [
  {
    path: "",
    component: SubscriptionComponent,
    data: { titleId: "subscription" },
    children: [
      { path: "", pathMatch: "full", redirectTo: "premium" },
      {
        path: "user-subscription",
        component: UserSubscriptionComponent,
        data: { titleId: "premiumMembership" },
      },
      ...featureFlaggedRoute({
        defaultComponent: PremiumComponent,
        flaggedComponent: PremiumV2Component,
        featureFlag: FeatureFlag.AC2476_DeprecateStripeSourcesAPI,
        routeOptions: {
          path: "premium",
          data: { titleId: "goPremium" },
        },
      }),
      {
        path: "payment-method",
        component: PaymentMethodComponent,
        data: { titleId: "paymentMethod" },
      },
      {
        path: "billing-history",
        component: BillingHistoryViewComponent,
        data: { titleId: "billingHistory" },
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class IndividualBillingRoutingModule {}
