import { Injectable } from "@angular/core";

import { BiometricsServiceAbstraction } from "@bitwarden/common/platform/biometrics/biometric.service.abstraction";

import { BrowserApi } from "../browser/browser-api";

@Injectable()
export class BrowserBiometricsService extends BiometricsServiceAbstraction {
  constructor(
    private biometricCallback: () => Promise<boolean>,
    private biometricUnlockAvailableCallback: () => Promise<boolean>,
  ) {
    super();
  }

  async supportsBiometric() {
    const platformInfo = await BrowserApi.getPlatformInfo();
    if (platformInfo.os === "mac" || platformInfo.os === "win") {
      return true;
    }
    return false;
  }

  authenticateBiometric(): Promise<boolean> {
    return this.biometricCallback();
  }

  isBiometricUnlockAvailable(): Promise<boolean> {
    return this.biometricUnlockAvailableCallback();
  }
}
