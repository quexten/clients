import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";

import { AuthGuard } from "@bitwarden/angular/auth/guards";
import { Provider } from "@bitwarden/common/admin-console/models/domain/provider";
import { ProvidersComponent } from "@bitwarden/web-vault/app/admin-console/providers/providers.component";
import { FrontendLayoutComponent } from "@bitwarden/web-vault/app/layouts/frontend-layout.component";
import { UserLayoutComponent } from "@bitwarden/web-vault/app/layouts/user-layout.component";

import {
  ManageClientOrganizationsComponent,
  ProviderSubscriptionComponent,
  hasConsolidatedBilling,
  ProviderPaymentMethodComponent,
} from "../../billing/providers";

import { ClientsComponent } from "./clients/clients.component";
import { CreateOrganizationComponent } from "./clients/create-organization.component";
import { ProviderPermissionsGuard } from "./guards/provider-permissions.guard";
import { AcceptProviderComponent } from "./manage/accept-provider.component";
import { EventsComponent } from "./manage/events.component";
import { PeopleComponent } from "./manage/people.component";
import { ProvidersLayoutComponent } from "./providers-layout.component";
import { AccountComponent } from "./settings/account.component";
import { SetupProviderComponent } from "./setup/setup-provider.component";
import { SetupComponent } from "./setup/setup.component";

const routes: Routes = [
  {
    path: "",
    canActivate: [AuthGuard],
    component: UserLayoutComponent,
    children: [
      {
        path: "",
        canActivate: [AuthGuard],
        component: ProvidersComponent,
        data: { titleId: "providers" },
      },
    ],
  },
  {
    path: "",
    component: FrontendLayoutComponent,
    children: [
      {
        path: "setup-provider",
        component: SetupProviderComponent,
        data: { titleId: "setupProvider" },
      },
      {
        path: "accept-provider",
        component: AcceptProviderComponent,
        data: { titleId: "acceptProvider" },
      },
    ],
  },
  {
    path: "",
    canActivate: [AuthGuard],
    children: [
      {
        path: "setup",
        component: SetupComponent,
      },
      {
        path: ":providerId",
        component: ProvidersLayoutComponent,
        canActivate: [ProviderPermissionsGuard],
        children: [
          { path: "", pathMatch: "full", redirectTo: "clients" },
          { path: "clients/create", component: CreateOrganizationComponent },
          { path: "clients", component: ClientsComponent, data: { titleId: "clients" } },
          {
            path: "manage-client-organizations",
            canActivate: [hasConsolidatedBilling],
            component: ManageClientOrganizationsComponent,
            data: { titleId: "clients" },
          },
          {
            path: "manage",
            children: [
              {
                path: "",
                pathMatch: "full",
                redirectTo: "people",
              },
              {
                path: "people",
                component: PeopleComponent,
                canActivate: [ProviderPermissionsGuard],
                data: {
                  titleId: "people",
                  providerPermissions: (provider: Provider) => provider.canManageUsers,
                },
              },
              {
                path: "events",
                component: EventsComponent,
                canActivate: [ProviderPermissionsGuard],
                data: {
                  titleId: "eventLogs",
                  providerPermissions: (provider: Provider) => provider.canAccessEventLogs,
                },
              },
            ],
          },
          {
            path: "billing",
            canActivate: [hasConsolidatedBilling],
            data: { providerPermissions: (provider: Provider) => provider.isProviderAdmin },
            children: [
              {
                path: "",
                pathMatch: "full",
                redirectTo: "subscription",
              },
              {
                path: "subscription",
                component: ProviderSubscriptionComponent,
                data: {
                  titleId: "subscription",
                },
              },
              {
                path: "payment-method",
                component: ProviderPaymentMethodComponent,
                data: {
                  titleId: "paymentMethod",
                },
              },
            ],
          },
          {
            path: "settings",
            children: [
              {
                path: "",
                pathMatch: "full",
                redirectTo: "account",
              },
              {
                path: "account",
                component: AccountComponent,
                canActivate: [ProviderPermissionsGuard],
                data: {
                  titleId: "myProvider",
                  providerPermissions: (provider: Provider) => provider.isProviderAdmin,
                },
              },
            ],
          },
        ],
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ProvidersRoutingModule {}
