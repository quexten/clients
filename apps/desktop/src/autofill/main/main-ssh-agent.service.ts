// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import * as path from "path";

import { Notification } from "electron";
import {
  catchError,
  combineLatest,
  concatMap,
  distinctUntilChanged,
  EMPTY,
  filter,
  firstValueFrom,
  from,
  map,
  skip,
  Subject,
  switchMap,
  takeUntil,
  tap,
} from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherType } from "@bitwarden/common/vault/enums";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { sshagent } from "@bitwarden/desktop-napi";

import { WindowMain } from "../../main/window.main";
import { DesktopSettingsService } from "../../platform/services/desktop-settings.service";
import { SshAgentPromptType } from "../models/ssh-agent-setting";

import {
  MainSshApprovalWindowService,
  SshApprovalPrompt,
} from "./main-ssh-approval-window.service";

/**
 * Namespacing for cached sign authorizations.
 */
const AuthorizationScope = Object.freeze({
  Local: "local",
  Forwarded: "forwarded",
} as const);
type AuthorizationScope = (typeof AuthorizationScope)[keyof typeof AuthorizationScope];

/**
 * The SSH agent, owned entirely by the main process.
 *
 * The socket server, protocol parsing, and signing run in Rust (via napi). This service now also
 * provisions the agent's keys (decrypting vault SSH-key ciphers), owns the sign-authorization cache
 * and prompt-behavior decision. Unlocking and approving happen in the small approval window
 * ({@link MainSshApprovalWindowService}), so the full renderer is never needed.
 */
export class MainSshAgentService {
  private agentState: sshagent.SshAgentState;
  private authorizedHosts: Map<string, Set<string>> = new Map();
  private destroy$ = new Subject<void>();

  constructor(
    private logService: LogService,
    private cipherService: CipherService,
    private authService: AuthService,
    private accountService: AccountService,
    private desktopSettingsService: DesktopSettingsService,
    private i18nService: I18nService,
    private windowMain: WindowMain,
    private approvalWindow: MainSshApprovalWindowService,
  ) {}

  /** Starts the reactive key-provisioning and authorization-reset pipelines. */
  init(): void {
    // Reset sign-approval state on account switch.
    this.accountService.activeAccount$
      .pipe(
        distinctUntilChanged((a, b) => a?.id === b?.id),
        skip(1),
        tap(() => {
          this.logService.debug("Active account changed, resetting SSH sign approval state");
          this.authorizedHosts = new Map();
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        error: (e: unknown) => {
          this.logService.error("Error in active account observable", e);
          this.authorizedHosts = new Map();
        },
        complete: () => {
          this.authorizedHosts = new Map();
        },
      });

    // Clear remembered sign-approvals whenever the vault is locked.
    this.authService.activeAccountStatus$
      .pipe(
        filter((status) => status !== AuthenticationStatus.Unlocked),
        takeUntil(this.destroy$),
      )
      .subscribe(() => {
        this.authorizedHosts = new Map();
      });

    // Push SSH keys to the agent reactively whenever cipher data changes while unlocked.
    this.accountService.activeAccount$
      .pipe(
        switchMap((account) => {
          if (account == null) {
            return from(this.stopAgent());
          }
          return combineLatest([
            this.authService.authStatusFor$(account.id),
            this.desktopSettingsService.sshAgentEnabled$,
          ]).pipe(
            switchMap(([status, enabled]) => {
              if (!enabled) {
                return from(this.stopAgent());
              }
              if (status === AuthenticationStatus.LoggedOut) {
                return EMPTY;
              }
              return from(this.ensureAgentRunning()).pipe(
                switchMap(() => this.cipherService.cipherViews$(account.id)),
                filter((views) => views != null),
                map((views) => this.toAgentKeys(views)),
                distinctUntilChanged((prev, curr) => {
                  if (prev.length !== curr.length) {
                    return false;
                  }
                  const prevMap = new Map(
                    prev.map((k) => [k.cipherId, { privateKey: k.privateKey, name: k.name }]),
                  );
                  return curr.every((k) => {
                    const p = prevMap.get(k.cipherId);
                    return p?.privateKey === k.privateKey && p?.name === k.name;
                  });
                }),
                concatMap(async (keys) => {
                  try {
                    this.replace(keys);
                  } catch (e) {
                    this.logService.error("Failed to push SSH keys to the agent", e);
                  }
                }),
                catchError((error: unknown) => {
                  this.logService.error("Unexpected error while syncing SSH keys", error);
                  return EMPTY;
                }),
              );
            }),
          );
        }),
        catchError((error: unknown) => {
          this.logService.error("SSH agent key pipeline stopped by an unrecoverable error", error);
          return EMPTY;
        }),
        takeUntil(this.destroy$),
      )
      .subscribe();
  }

  dispose(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async initAgent(): Promise<void> {
    const signCb = (_err: Error | null, data: sshagent.SignRequestData) => this.requestSign(data);
    const listCb = (_err: Error | null) => this.requestListKeys();
    try {
      this.agentState = await sshagent.SshAgentState.serve(signCb, listCb);
      this.logService.info("SSH agent started");
    } catch (e: unknown) {
      this.logService.error("SSH agent encountered an error: ", e);
    }
  }

  private async ensureAgentRunning(): Promise<void> {
    if (this.agentState == null || !this.agentState.isRunning()) {
      await this.initAgent();
    }
  }

  private async stopAgent(): Promise<void> {
    if (this.agentState != null) {
      this.agentState.stop();
      this.agentState = null;
    }
  }

  private replace(keys: { name: string; privateKey: string; cipherId: string }[]): void {
    if (this.agentState != null && this.agentState.isRunning()) {
      this.agentState.replace(keys);
    }
  }

  private toAgentKeys(
    ciphers: CipherView[],
  ): { name: string; privateKey: string; cipherId: string }[] {
    return ciphers
      .filter((c) => c.type === CipherType.SshKey && !c.isDeleted && !c.isArchived)
      .map((c) => ({ name: c.name, privateKey: c.sshKey.privateKey, cipherId: c.id }));
  }

  private requestListKeys(): Promise<boolean> {
    return this.approvalWindow.session((prompt) => this.listKeys(prompt));
  }

  private async listKeys(prompt: SshApprovalPrompt): Promise<boolean> {
    if (!(await prompt.unlock())) {
      return false;
    }

    try {
      const account = await firstValueFrom(this.accountService.activeAccount$);
      if (account == null) {
        return false;
      }
      const ciphers = await this.cipherService.getAllDecrypted(account.id);
      this.replace(this.toAgentKeys(ciphers ?? []));
      return true;
    } catch (e) {
      this.logService.error("Failed to push SSH keys to the agent", e);
      return false;
    }
  }

  private async requestSign(data: sshagent.SignRequestData): Promise<boolean> {
    if (!(await firstValueFrom(this.desktopSettingsService.sshAgentEnabled$))) {
      return false;
    }
    return this.approvalWindow.session((prompt) => this.sign(prompt, data));
  }

  private async sign(prompt: SshApprovalPrompt, data: sshagent.SignRequestData): Promise<boolean> {
    if (!(await prompt.unlock())) {
      return false;
    }

    let ciphers: CipherView[];
    try {
      const account = await firstValueFrom(this.accountService.activeAccount$);
      if (account == null) {
        return false;
      }
      ciphers = await this.cipherService.getAllDecrypted(account.id);
    } catch (e) {
      this.logService.error("Failed to decrypt the vault for an SSH sign request", e);
      return false;
    }

    // The agent derives cipherId from its own keystore, which outlives a vault lock and an account
    // switch, so a cipher received in the request might not be present in the active vault.
    const cipher = ciphers?.find((c) => c.id === data.cipherId);
    if (cipher == null) {
      this.logService.error(
        "SSH sign request received for key not in the active vault; rejecting.",
      );
      return false;
    }

    let application = data.signRequest.processName;
    if (application === "") {
      application = this.i18nService.t("unknownApplication");
    }

    await this.showSignRequestNotification(cipher.name, application);

    const isAgentForwarding = data.signRequest.isForwarding;
    const hostFingerprint = data.signRequest.hostFingerprint;
    if (!(await this.needsAuthorization(data.cipherId, isAgentForwarding, hostFingerprint))) {
      return true;
    }

    const accepted = await prompt.approve({
      cipherName: cipher.name,
      application,
      isAgentForwarding,
      namespace: data.signRequest.namespace,
    });
    if (accepted) {
      this.storeAuthorizedHost(data.cipherId, isAgentForwarding, hostFingerprint);
    }
    return accepted;
  }

  private async showSignRequestNotification(
    cipherName: string,
    application: string,
  ): Promise<void> {
    try {
      const alert = new Notification({
        title: this.i18nService.t("sshAgentApprovalNotificationTitle"),
        body: this.i18nService.t("sshAgentApprovalNotificationBody", application, cipherName),
        closeButtonText: this.i18nService.t("close"),
        icon: path.join(__dirname, "images/icon.png"),
      });
      // Bring up the approval prompt if one is open, the full app otherwise.
      alert.addListener("click", () => {
        if (!this.approvalWindow.focus()) {
          void this.windowMain.ensureRenderer();
        }
      });
      alert.show();
    } catch (e) {
      this.logService.error("Failed to show the SSH agent sign request notification", e);
    }
  }

  private async needsAuthorization(
    cipherId: string,
    isForwarded: boolean,
    hostFingerprint?: string,
  ): Promise<boolean> {
    const scope = MainSshAgentService.authorizationScope(isForwarded);
    const promptType = await firstValueFrom(this.desktopSettingsService.sshAgentPromptBehavior$);

    switch (promptType) {
      case SshAgentPromptType.Never:
        this.logAuthorizationDecision(scope, promptType, "approving.");
        return false;

      case SshAgentPromptType.Always:
        this.logAuthorizationDecision(scope, promptType, "prompting.");
        return true;

      case SshAgentPromptType.RememberUntilLock: {
        const key = MainSshAgentService.authorizedHostsCacheKey(isForwarded, hostFingerprint);
        if (!key) {
          this.logAuthorizationDecision(scope, promptType, "prompting- no host key from request.");
          return true;
        }
        if (this.authorizedHosts.get(cipherId)?.has(key) ?? false) {
          this.logAuthorizationDecision(scope, promptType, "approving remembered host.");
          return false;
        }
        this.logAuthorizationDecision(scope, promptType, "prompting- new host.");
        return true;
      }
    }
  }

  private storeAuthorizedHost(
    cipherId: string,
    isForwarded: boolean,
    hostFingerprint?: string,
  ): void {
    const key = MainSshAgentService.authorizedHostsCacheKey(isForwarded, hostFingerprint);
    if (!key) {
      return;
    }
    const authorized = this.authorizedHosts.get(cipherId) ?? new Set<string>();
    authorized.add(key);
    this.authorizedHosts.set(cipherId, authorized);
  }

  private static authorizationScope(isForwarded: boolean): AuthorizationScope {
    return isForwarded ? AuthorizationScope.Forwarded : AuthorizationScope.Local;
  }

  private static authorizedHostsCacheKey(
    isForwarded: boolean,
    hostFingerprint?: string,
  ): string | undefined {
    const scope = MainSshAgentService.authorizationScope(isForwarded);
    if (hostFingerprint) {
      return `${scope}:${hostFingerprint}`;
    }
    if (isForwarded) {
      return undefined;
    }
    return AuthorizationScope.Local;
  }

  private logAuthorizationDecision(
    scope: AuthorizationScope,
    promptType: SshAgentPromptType,
    outcome: string,
  ) {
    this.logService.debug(
      `SSH sign authorization (${scope}, prompt setting: ${promptType}): ${outcome}`,
    );
  }
}
