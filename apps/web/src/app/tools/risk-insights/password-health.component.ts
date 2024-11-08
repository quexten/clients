import { CommonModule } from "@angular/common";
import { Component, DestroyRef, inject, OnInit } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute } from "@angular/router";
import { map } from "rxjs";

import { JslibModule } from "@bitwarden/angular/jslib.module";
// eslint-disable-next-line no-restricted-imports
import { PasswordHealthService } from "@bitwarden/bit-common/tools/reports/risk-insights";
import { AuditService } from "@bitwarden/common/abstractions/audit.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { PasswordStrengthServiceAbstraction } from "@bitwarden/common/tools/password-strength";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import {
  BadgeModule,
  BadgeVariant,
  ContainerComponent,
  TableDataSource,
  TableModule,
} from "@bitwarden/components";

// eslint-disable-next-line no-restricted-imports
import { HeaderModule } from "../../layouts/header/header.module";
// eslint-disable-next-line no-restricted-imports
import { OrganizationBadgeModule } from "../../vault/individual-vault/organization-badge/organization-badge.module";
// eslint-disable-next-line no-restricted-imports
import { PipesModule } from "../../vault/individual-vault/pipes/pipes.module";

@Component({
  standalone: true,
  selector: "tools-password-health",
  templateUrl: "password-health.component.html",
  imports: [
    BadgeModule,
    OrganizationBadgeModule,
    CommonModule,
    ContainerComponent,
    PipesModule,
    JslibModule,
    HeaderModule,
    TableModule,
  ],
  providers: [PasswordHealthService],
})
export class PasswordHealthComponent implements OnInit {
  passwordStrengthMap = new Map<string, [string, BadgeVariant]>();

  passwordUseMap = new Map<string, number>();

  exposedPasswordMap = new Map<string, number>();

  dataSource = new TableDataSource<CipherView>();

  loading = true;

  private destroyRef = inject(DestroyRef);

  constructor(
    protected cipherService: CipherService,
    protected passwordStrengthService: PasswordStrengthServiceAbstraction,
    protected auditService: AuditService,
    protected i18nService: I18nService,
    protected activatedRoute: ActivatedRoute,
  ) {}

  ngOnInit() {
    this.activatedRoute.paramMap
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        map(async (params) => {
          const organizationId = params.get("organizationId");
          await this.setCiphers(organizationId);
        }),
      )
      .subscribe();
  }

  async setCiphers(organizationId: string) {
    const passwordHealthService = new PasswordHealthService(
      this.passwordStrengthService,
      this.auditService,
      this.cipherService,
      organizationId,
    );

    await passwordHealthService.generateReport();

    this.dataSource.data = passwordHealthService.reportCiphers;
    this.exposedPasswordMap = passwordHealthService.exposedPasswordMap;
    this.passwordStrengthMap = passwordHealthService.passwordStrengthMap;
    this.passwordUseMap = passwordHealthService.passwordUseMap;
    this.loading = false;
  }
}
