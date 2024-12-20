// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from "@angular/core";
import { Router } from "@angular/router";

import { SendComponent as BaseSendComponent } from "@bitwarden/angular/tools/send/send.component";
import { SearchService } from "@bitwarden/common/abstractions/search.service";
import { PolicyService } from "@bitwarden/common/admin-console/abstractions/policy/policy.service.abstraction";
import { BroadcasterService } from "@bitwarden/common/platform/abstractions/broadcaster.service";
import { EnvironmentService } from "@bitwarden/common/platform/abstractions/environment.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { SendType } from "@bitwarden/common/tools/send/enums/send-type";
import { SendView } from "@bitwarden/common/tools/send/models/view/send.view";
import { SendApiService } from "@bitwarden/common/tools/send/services/send-api.service.abstraction";
import { SendService } from "@bitwarden/common/tools/send/services/send.service.abstraction";
import { SyncService } from "@bitwarden/common/vault/abstractions/sync/sync.service.abstraction";
import { DialogService, ToastService } from "@bitwarden/components";

import { BrowserSendComponentState } from "../../../models/browserSendComponentState";
import BrowserPopupUtils from "../../../platform/popup/browser-popup-utils";
import { BrowserSendStateService } from "../services/browser-send-state.service";

const ComponentId = "SendComponent";

@Component({
  selector: "app-send-groupings",
  templateUrl: "send-groupings.component.html",
})
export class SendGroupingsComponent extends BaseSendComponent implements OnInit, OnDestroy {
  // Header
  showLeftHeader = true;
  // State Handling
  state: BrowserSendComponentState;
  private loadedTimeout: number;

  constructor(
    sendService: SendService,
    i18nService: I18nService,
    platformUtilsService: PlatformUtilsService,
    environmentService: EnvironmentService,
    ngZone: NgZone,
    policyService: PolicyService,
    searchService: SearchService,
    private stateService: BrowserSendStateService,
    private router: Router,
    private syncService: SyncService,
    private changeDetectorRef: ChangeDetectorRef,
    private broadcasterService: BroadcasterService,
    logService: LogService,
    sendApiService: SendApiService,
    dialogService: DialogService,
    toastService: ToastService,
  ) {
    super(
      sendService,
      i18nService,
      platformUtilsService,
      environmentService,
      ngZone,
      searchService,
      policyService,
      logService,
      sendApiService,
      dialogService,
      toastService,
    );
    this.onSuccessfulLoad = async () => {
      this.selectAll();
    };
  }

  async ngOnInit() {
    // Determine Header details
    this.showLeftHeader = !(
      BrowserPopupUtils.inSidebar(window) && this.platformUtilsService.isFirefox()
    );
    // Clear state of Send Type Component
    await this.stateService.setBrowserSendTypeComponentState(null);
    // Let super class finish
    await super.ngOnInit();
    // Handle State Restore if necessary
    const restoredScopeState = await this.restoreState();
    if (this.state?.searchText != null) {
      this.searchText = this.state.searchText;
    }

    if (!this.syncService.syncInProgress) {
      // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.load();
    } else {
      this.loadedTimeout = window.setTimeout(() => {
        if (!this.loaded) {
          // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          this.load();
        }
      }, 5000);
    }

    if (!this.syncService.syncInProgress || restoredScopeState) {
      // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      BrowserPopupUtils.setContentScrollY(window, this.state?.scrollY);
    }

    // Load all sends if sync completed in background
    this.broadcasterService.subscribe(ComponentId, (message: any) => {
      // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.ngZone.run(async () => {
        switch (message.command) {
          case "syncCompleted":
            window.setTimeout(() => {
              // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              this.load();
            }, 500);
            break;
          default:
            break;
        }

        this.changeDetectorRef.detectChanges();
      });
    });
  }

  ngOnDestroy() {
    // Remove timeout
    if (this.loadedTimeout != null) {
      window.clearTimeout(this.loadedTimeout);
    }
    // Save state
    // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.saveState();
    // Unsubscribe
    this.broadcasterService.unsubscribe(ComponentId);
  }

  async selectType(type: SendType) {
    // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.router.navigate(["/send-type"], { queryParams: { type: type } });
  }

  async selectSend(s: SendView) {
    // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.router.navigate(["/edit-send"], { queryParams: { sendId: s.id } });
  }

  async addSend() {
    if (this.disableSend) {
      return;
    }
    // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.router.navigate(["/add-send"]);
  }

  async removePassword(s: SendView): Promise<boolean> {
    if (this.disableSend) {
      return;
    }
    // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    super.removePassword(s);
  }

  showSearching() {
    return this.hasSearched || (!this.searchPending && this.isSearchable);
  }

  getSendCount(sends: SendView[], type: SendType): number {
    return sends.filter((s) => s.type === type).length;
  }

  private async saveState() {
    this.state = Object.assign(new BrowserSendComponentState(), {
      scrollY: BrowserPopupUtils.getContentScrollY(window),
      searchText: this.searchText,
      sends: this.sends,
    });
    await this.stateService.setBrowserSendComponentState(this.state);
  }

  private async restoreState(): Promise<boolean> {
    this.state = await this.stateService.getBrowserSendComponentState();
    if (this.state == null) {
      return false;
    }

    if (this.state.sends != null) {
      this.sends = this.state.sends;
    }

    return true;
  }
}
