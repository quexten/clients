import { CommonModule } from "@angular/common";
import {
  QueryList,
  Component,
  ElementRef,
  OnDestroy,
  AfterViewInit,
  ViewChildren,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { Subject, takeUntil } from "rxjs";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { DomainSettingsService } from "@bitwarden/common/autofill/services/domain-settings.service";
import { NeverDomains } from "@bitwarden/common/models/domain/domain-service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { Utils } from "@bitwarden/common/platform/misc/utils";
import {
  ButtonModule,
  CardComponent,
  FormFieldModule,
  IconButtonModule,
  ItemModule,
  LinkModule,
  SectionComponent,
  SectionHeaderComponent,
  TypographyModule,
} from "@bitwarden/components";

import { enableAccountSwitching } from "../../../platform/flags";
import { PopOutComponent } from "../../../platform/popup/components/pop-out.component";
import { PopupFooterComponent } from "../../../platform/popup/layout/popup-footer.component";
import { PopupHeaderComponent } from "../../../platform/popup/layout/popup-header.component";
import { PopupPageComponent } from "../../../platform/popup/layout/popup-page.component";

@Component({
  selector: "app-excluded-domains",
  templateUrl: "excluded-domains.component.html",
  standalone: true,
  imports: [
    ButtonModule,
    CardComponent,
    CommonModule,
    FormFieldModule,
    FormsModule,
    IconButtonModule,
    ItemModule,
    JslibModule,
    LinkModule,
    PopOutComponent,
    PopupFooterComponent,
    PopupHeaderComponent,
    PopupPageComponent,
    RouterModule,
    SectionComponent,
    SectionHeaderComponent,
    TypographyModule,
  ],
})
export class ExcludedDomainsComponent implements AfterViewInit, OnDestroy {
  @ViewChildren("uriInput") uriInputElements: QueryList<ElementRef<HTMLInputElement>>;

  accountSwitcherEnabled = false;
  dataIsPristine = true;
  isLoading = false;
  excludedDomainsState: string[] = [];
  storedExcludedDomains: string[] = [];
  // How many fields should be non-editable before editable fields
  fieldsEditThreshold: number = 0;

  private destroy$ = new Subject<void>();

  constructor(
    private domainSettingsService: DomainSettingsService,
    private i18nService: I18nService,
    private platformUtilsService: PlatformUtilsService,
  ) {
    this.accountSwitcherEnabled = enableAccountSwitching();
  }

  async ngAfterViewInit() {
    this.domainSettingsService.neverDomains$
      .pipe(takeUntil(this.destroy$))
      .subscribe((neverDomains: NeverDomains) => this.handleStateUpdate(neverDomains));

    this.uriInputElements.changes.pipe(takeUntil(this.destroy$)).subscribe(({ last }) => {
      this.focusNewUriInput(last);
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  handleStateUpdate(neverDomains: NeverDomains) {
    if (neverDomains) {
      this.storedExcludedDomains = Object.keys(neverDomains);
    }

    this.excludedDomainsState = [...this.storedExcludedDomains];

    // Do not allow the first x (pre-existing) fields to be edited
    this.fieldsEditThreshold = this.storedExcludedDomains.length;

    this.dataIsPristine = true;
    this.isLoading = false;
  }

  focusNewUriInput(elementRef: ElementRef) {
    if (elementRef?.nativeElement) {
      elementRef.nativeElement.focus();
    }
  }

  async addNewDomain() {
    // add empty field to the Domains list interface
    this.excludedDomainsState.push("");

    await this.fieldChange();
  }

  async removeDomain(i: number) {
    this.excludedDomainsState.splice(i, 1);

    // If a pre-existing field was dropped, lower the edit threshold
    if (i < this.fieldsEditThreshold) {
      this.fieldsEditThreshold--;
    }

    await this.fieldChange();
  }

  async fieldChange() {
    if (this.dataIsPristine) {
      this.dataIsPristine = false;
    }
  }

  async saveChanges() {
    if (this.dataIsPristine) {
      return;
    }

    this.isLoading = true;

    const newExcludedDomainsSaveState: NeverDomains = {};
    const uniqueExcludedDomains = new Set(this.excludedDomainsState);

    for (const uri of uniqueExcludedDomains) {
      if (uri && uri !== "") {
        const validatedHost = Utils.getHostname(uri);

        if (!validatedHost) {
          this.platformUtilsService.showToast(
            "error",
            null,
            this.i18nService.t("excludedDomainsInvalidDomain", uri),
          );

          // Don't reset via `handleStateUpdate` to allow existing input value correction
          this.isLoading = false;
          return;
        }

        newExcludedDomainsSaveState[validatedHost] = null;
      }
    }

    try {
      const existingState = new Set(this.storedExcludedDomains);
      const newState = new Set(Object.keys(newExcludedDomainsSaveState));
      const stateIsUnchanged =
        existingState.size === newState.size &&
        new Set([...existingState, ...newState]).size === existingState.size;

      // The subscriber updates don't trigger if `setNeverDomains` sets an equivalent state
      if (stateIsUnchanged) {
        // Reset UI state directly
        const constructedNeverDomainsState = this.storedExcludedDomains.reduce(
          (neverDomains, uri) => ({ ...neverDomains, [uri]: null }),
          {},
        );
        this.handleStateUpdate(constructedNeverDomainsState);
      } else {
        await this.domainSettingsService.setNeverDomains(newExcludedDomainsSaveState);
      }

      this.platformUtilsService.showToast(
        "success",
        null,
        this.i18nService.t("excludedDomainsSavedSuccess"),
      );
    } catch {
      this.platformUtilsService.showToast("error", null, this.i18nService.t("unexpectedError"));

      // Don't reset via `handleStateUpdate` to preserve input values
      this.isLoading = false;
    }
  }

  trackByFunction(index: number, _: string) {
    return index;
  }
}
