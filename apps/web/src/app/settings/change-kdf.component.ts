import { Component, OnInit } from "@angular/core";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { CryptoService } from "@bitwarden/common/abstractions/crypto.service";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/abstractions/log.service";
import { MessagingService } from "@bitwarden/common/abstractions/messaging.service";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { StateService } from "@bitwarden/common/abstractions/state.service";
import {
  DEFAULT_KDF_ITERATIONS,
  DEFAULT_ARGON2_MEMORY,
  KdfType,
} from "@bitwarden/common/enums/kdfType";
import { KdfRequest } from "@bitwarden/common/models/request/kdf.request";

@Component({
  selector: "app-change-kdf",
  templateUrl: "change-kdf.component.html",
})
export class ChangeKdfComponent implements OnInit {
  masterPassword: string;
  kdfIterations: number;
  kdf = KdfType.PBKDF2_SHA256;
  kdfOptions: any[] = [];
  formPromise: Promise<any>;
  recommendedKdfIterations = DEFAULT_KDF_ITERATIONS;
  memory = DEFAULT_ARGON2_MEMORY;
  recommendedMemory = DEFAULT_ARGON2_MEMORY;

  constructor(
    private apiService: ApiService,
    private i18nService: I18nService,
    private platformUtilsService: PlatformUtilsService,
    private cryptoService: CryptoService,
    private messagingService: MessagingService,
    private logService: LogService,
    private stateService: StateService
  ) {
    this.kdfOptions = [
      { name: "PBKDF2 SHA-256", value: KdfType.PBKDF2_SHA256 },
      { name: "Argon2id", value: KdfType.Argon2id },
    ];
  }

  async ngOnInit() {
    this.kdf = await this.stateService.getKdfType();
    switch (this.kdf) {
      case KdfType.PBKDF2_SHA256:
        this.kdfIterations = await this.stateService.getKdfIterations();
        this.memory = DEFAULT_ARGON2_MEMORY;
        break;
      case KdfType.Argon2id:
        this.kdfIterations = DEFAULT_KDF_ITERATIONS;
        this.memory = await this.stateService.getKdfIterations();
        break;
    }
  }

  async submit() {
    const hasEncKey = await this.cryptoService.hasEncKey();
    if (!hasEncKey) {
      this.platformUtilsService.showToast("error", null, this.i18nService.t("updateKey"));
      return;
    }

    let kdfParameters = DEFAULT_KDF_ITERATIONS;
    switch (this.kdf) {
      case KdfType.PBKDF2_SHA256:
        kdfParameters = this.kdfIterations;
        break;
      case KdfType.Argon2id:
        kdfParameters = this.memory;
        break;
    }

    const request = new KdfRequest();
    request.kdf = this.kdf;
    request.kdfIterations = kdfParameters;
    request.masterPasswordHash = await this.cryptoService.hashPassword(this.masterPassword, null);
    const email = await this.stateService.getEmail();
    const newKey = await this.cryptoService.makeKey(
      this.masterPassword,
      email,
      this.kdf,
      kdfParameters
    );
    request.newMasterPasswordHash = await this.cryptoService.hashPassword(
      this.masterPassword,
      newKey
    );
    const newEncKey = await this.cryptoService.remakeEncKey(newKey);
    request.key = newEncKey[1].encryptedString;
    try {
      this.formPromise = this.apiService.postAccountKdf(request);
      await this.formPromise;
      this.platformUtilsService.showToast(
        "success",
        this.i18nService.t("encKeySettingsChanged"),
        this.i18nService.t("logBackIn")
      );
      this.messagingService.send("logout");
    } catch (e) {
      this.logService.error(e);
    }
  }
}
