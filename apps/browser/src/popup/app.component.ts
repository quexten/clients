import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit, inject } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { NavigationEnd, Router, RouterOutlet } from "@angular/router";
import { Subject, takeUntil, firstValueFrom, concatMap, filter, tap } from "rxjs";

import { LogoutReason } from "@bitwarden/auth/common";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { AnimationControlService } from "@bitwarden/common/platform/abstractions/animation-control.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { SdkService } from "@bitwarden/common/platform/abstractions/sdk/sdk.service";
import { StateService } from "@bitwarden/common/platform/abstractions/state.service";
import { MessageListener } from "@bitwarden/common/platform/messaging";
import { UserId } from "@bitwarden/common/types/guid";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import {
  DialogService,
  SimpleDialogOptions,
  ToastOptions,
  ToastService,
} from "@bitwarden/components";

import { flagEnabled } from "../platform/flags";
import { PopupViewCacheService } from "../platform/popup/view-cache/popup-view-cache.service";
import { initPopupClosedListener } from "../platform/services/popup-view-cache-background.service";
import { BrowserSendStateService } from "../tools/popup/services/browser-send-state.service";
import { VaultBrowserStateService } from "../vault/services/vault-browser-state.service";

import { routerTransition } from "./app-routing.animations";
import { DesktopSyncVerificationDialogComponent } from "./components/desktop-sync-verification-dialog.component";

@Component({
  selector: "app-root",
  styles: [],
  animations: [routerTransition],
  template: ` <div [@routerTransition]="getState(o)">
    <router-outlet #o="outlet"></router-outlet>
  </div>`,
})
export class AppComponent implements OnInit, OnDestroy {
  private viewCacheService = inject(PopupViewCacheService);

  private lastActivity: Date;
  private activeUserId: UserId;
  private recordActivitySubject = new Subject<void>();
  private routerAnimations = false;

  private destroy$ = new Subject<void>();

  constructor(
    private authService: AuthService,
    private i18nService: I18nService,
    private router: Router,
    private stateService: StateService,
    private browserSendStateService: BrowserSendStateService,
    private vaultBrowserStateService: VaultBrowserStateService,
    private cipherService: CipherService,
    private changeDetectorRef: ChangeDetectorRef,
    private ngZone: NgZone,
    private platformUtilsService: PlatformUtilsService,
    private dialogService: DialogService,
    private messageListener: MessageListener,
    private toastService: ToastService,
    private accountService: AccountService,
    private animationControlService: AnimationControlService,
    private logService: LogService,
    private sdkService: SdkService,
  ) {
    if (flagEnabled("sdk")) {
      // Warn if the SDK for some reason can't be initialized
      this.sdkService.supported$.pipe(takeUntilDestroyed()).subscribe({
        next: (supported) => {
          if (!supported) {
            this.logService.debug("SDK is not supported");
            this.sdkService
              .failedToInitialize("popup", undefined)
              .catch((e) => this.logService.error(e));
          } else {
            this.logService.debug("SDK is supported");
          }
        },
        error: (e: unknown) => {
          this.sdkService
            .failedToInitialize("popup", e as Error)
            .catch((e) => this.logService.error(e));
          this.logService.error(e);
        },
      });
    }
  }

  async ngOnInit() {
    initPopupClosedListener();
    await this.viewCacheService.init();

    // Component states must not persist between closing and reopening the popup, otherwise they become dead objects
    // Clear them aggressively to make sure this doesn't occur
    await this.clearComponentStates();

    this.accountService.activeAccount$.pipe(takeUntil(this.destroy$)).subscribe((account) => {
      this.activeUserId = account?.id;
    });

    this.authService.activeAccountStatus$
      .pipe(
        filter((status) => status === AuthenticationStatus.Unlocked),
        concatMap(async () => {
          await this.recordActivity();
        }),
        takeUntil(this.destroy$),
      )
      .subscribe();

    this.ngZone.runOutsideAngular(() => {
      window.onmousedown = () => this.recordActivity();
      window.ontouchstart = () => this.recordActivity();
      window.onclick = () => this.recordActivity();
      window.onscroll = () => this.recordActivity();
      window.onkeypress = () => this.recordActivity();
    });

    this.messageListener.allMessages$
      .pipe(
        tap((msg: any) => {
          if (msg.command === "doneLoggingOut") {
            // TODO: PM-8544 - why do we call logout in the popup after receiving the doneLoggingOut message? Hasn't this already completeted logout?
            this.authService.logOut(async () => {
              if (msg.logoutReason) {
                await this.displayLogoutReason(msg.logoutReason);
              }
            });
            this.changeDetectorRef.detectChanges();
          } else if (msg.command === "authBlocked" || msg.command === "goHome") {
            // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.router.navigate(["home"]);
          } else if (
            msg.command === "locked" &&
            (msg.userId == null || msg.userId == this.activeUserId)
          ) {
            // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.router.navigate(["lock"]);
          } else if (msg.command === "showDialog") {
            // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.showDialog(msg);
          } else if (msg.command === "showNativeMessagingFinterprintDialog") {
            // TODO: Should be refactored to live in another service.
            // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.showNativeMessagingFingerprintDialog(msg);
          } else if (msg.command === "showToast") {
            this.toastService._showToast(msg);
          } else if (msg.command === "reloadProcess") {
            if (this.platformUtilsService.isSafari()) {
              window.setTimeout(() => {
                window.location.reload();
              }, 2000);
            }
          } else if (msg.command === "reloadPopup") {
            // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.router.navigate(["/"]);
          } else if (msg.command === "convertAccountToKeyConnector") {
            // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.router.navigate(["/remove-password"]);
          } else if (msg.command == "update-temp-password") {
            // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.router.navigate(["/update-temp-password"]);
          }
        }),
        takeUntil(this.destroy$),
      )
      .subscribe();

    // eslint-disable-next-line rxjs/no-async-subscribe
    this.router.events.pipe(takeUntil(this.destroy$)).subscribe(async (event) => {
      if (event instanceof NavigationEnd) {
        const url = event.urlAfterRedirects || event.url || "";
        if (
          url.startsWith("/tabs/") &&
          (window as any).previousPopupUrl != null &&
          (window as any).previousPopupUrl.startsWith("/tabs/")
        ) {
          await this.clearComponentStates();
        }
        if (url.startsWith("/tabs/")) {
          await this.cipherService.setAddEditCipherInfo(null);
        }
        (window as any).previousPopupUrl = url;

        // Clear route direction after animation (400ms)
        if ((window as any).routeDirection != null) {
          window.setTimeout(() => {
            (window as any).routeDirection = null;
          }, 400);
        }
      }
    });

    this.animationControlService.enableRoutingAnimation$
      .pipe(takeUntil(this.destroy$))
      .subscribe((state) => {
        this.routerAnimations = state;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getState(outlet: RouterOutlet) {
    if (!this.routerAnimations) {
      return;
    } else if (outlet.activatedRouteData.state === "ciphers") {
      const routeDirection =
        (window as any).routeDirection != null ? (window as any).routeDirection : "";
      return (
        "ciphers_direction=" +
        routeDirection +
        "_" +
        (outlet.activatedRoute.queryParams as any).value.folderId +
        "_" +
        (outlet.activatedRoute.queryParams as any).value.collectionId
      );
    } else {
      return outlet.activatedRouteData.state;
    }
  }

  private async recordActivity() {
    if (this.activeUserId == null) {
      return;
    }

    const now = new Date();
    if (this.lastActivity != null && now.getTime() - this.lastActivity.getTime() < 250) {
      return;
    }

    this.lastActivity = now;
    await this.accountService.setAccountActivity(this.activeUserId, now);
  }

  private showToast(msg: any) {
    this.platformUtilsService.showToast(msg.type, msg.title, msg.text, msg.options);
  }

  private async showDialog(msg: SimpleDialogOptions) {
    await this.dialogService.openSimpleDialog(msg);
  }

  private async showNativeMessagingFingerprintDialog(msg: any) {
    const dialogRef = DesktopSyncVerificationDialogComponent.open(this.dialogService, {
      fingerprint: msg.fingerprint,
    });

    return firstValueFrom(dialogRef.closed);
  }

  private async clearComponentStates() {
    if (!(await this.stateService.getIsAuthenticated())) {
      return;
    }

    await Promise.all([
      this.vaultBrowserStateService.setBrowserGroupingsComponentState(null),
      this.vaultBrowserStateService.setBrowserVaultItemsComponentState(null),
      this.browserSendStateService.setBrowserSendComponentState(null),
      this.browserSendStateService.setBrowserSendTypeComponentState(null),
    ]);
  }

  // Displaying toasts isn't super useful on the popup due to the reloads we do.
  // However, it is visible for a moment on the FF sidebar logout.
  private async displayLogoutReason(logoutReason: LogoutReason) {
    let toastOptions: ToastOptions | null = null;
    switch (logoutReason) {
      case "invalidSecurityStamp":
      case "sessionExpired": {
        toastOptions = {
          variant: "warning",
          title: this.i18nService.t("loggedOut"),
          message: this.i18nService.t("loginExpired"),
        };
        break;
      }
    }

    if (toastOptions == null) {
      // We don't have anything to show for this particular reason
      return;
    }

    this.toastService.showToast(toastOptions);
  }
}
