import { Injectable, OnDestroy } from "@angular/core";
import { concatMap, distinctUntilChanged, map, Observable, of, Subject, takeUntil } from "rxjs";

import {
  ActiveUserStateProvider,
  MAGNIFY_SETTINGS_DISK,
  UserKeyDefinition,
} from "@bitwarden/common/platform/state";

import { MagnifyCommand } from "../models/magnify-commands";

import { MagnifyNavigationService } from "./magnify-navigation.service";

export const MAGNIFY_ENABLED = new UserKeyDefinition<boolean | null>(
  MAGNIFY_SETTINGS_DISK,
  "magnifyEnabled",
  {
    deserializer: (value: boolean | null) => !!value,
    clearOn: [],
  },
);

@Injectable({
  providedIn: "root",
})
export class DesktopMagnifyService implements OnDestroy {
  private readonly magnifyEnabledState = this.activeUserStateProvider.get(MAGNIFY_ENABLED);

  // The enabled/disabled state from the user settings menu
  magnifyEnabledUserSetting$: Observable<boolean> = of(false);

  // Magnify is active whenever the user has the setting enabled — auth state
  // is checked at the command level so the UI can show a locked/logged-out message.
  private magnifyFeatureEnabled$: Observable<boolean> = of(false);

  private destroy$ = new Subject<void>();

  constructor(
    private activeUserStateProvider: ActiveUserStateProvider,
    private magnifyNavigationService: MagnifyNavigationService,
  ) {
    this.magnifyEnabledUserSetting$ = this.magnifyEnabledState.state$.pipe(
      map((enabled) => enabled ?? false),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    );

    this.magnifyFeatureEnabled$ = this.magnifyEnabledUserSetting$.pipe(
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    );
  }

  async init() {
    this.magnifyFeatureEnabled$
      .pipe(
        concatMap(async (enabled) => {
          ipc.autofill.magnify.toggleMagnify(enabled);
        }),
        takeUntil(this.destroy$),
      )
      .subscribe();

    // Most Magnify commands are served by the main process, which owns the session and the
    // decrypted vault keys. The renderer is only needed for ViewInBitwarden, which navigates
    // the Angular UI to the requested item.
    ipc.autofill.magnify.listenMagnifyCommand(async (request, callback) => {
      if (request.type !== MagnifyCommand.ViewInBitwarden) {
        callback(new Error("Unsupported Magnify command relayed to the renderer."), null);
        return;
      }

      this.magnifyNavigationService.requestViewInBitwarden(request.itemId);
      callback(null, { type: MagnifyCommand.ViewInBitwarden });
    });
  }

  async setMagnifyEnabledState(enabled: boolean): Promise<void> {
    await this.magnifyEnabledState.update(() => enabled, {
      shouldUpdate: (currentlyEnabled) => currentlyEnabled !== enabled,
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
