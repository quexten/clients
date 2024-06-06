import { Params } from "@angular/router";
import { Jsonify } from "type-fest";

export class OrganizationInvite {
  email: string;
  initOrganization: boolean;
  orgSsoIdentifier: string;
  orgUserHasExistingUser: boolean;
  organizationId: string;
  organizationName: string;
  organizationUserId: string;
  token: string;

  static fromJSON(json: Jsonify<OrganizationInvite>) {
    return Object.assign(new OrganizationInvite(), json);
  }

  static fromParams(params: Params): OrganizationInvite {
    return Object.assign(new OrganizationInvite(), {
      email: params.email,
      initOrganization: params.initOrganization?.toLocaleLowerCase() === "true",
      orgSsoIdentifier: params.orgSsoIdentifier,
      orgUserHasExistingUser: params.orgUserHasExistingUser?.toLocaleLowerCase() === "true",
      organizationId: params.organizationId,
      organizationName: params.organizationName,
      organizationUserId: params.organizationUserId,
      token: params.token,
    });
  }
}
