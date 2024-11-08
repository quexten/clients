import { Injectable } from "@angular/core";

import { BiometricsService } from "@bitwarden/key-management";

/**
 * This service implement the base biometrics service to provide desktop specific functions,
 * specifically for the renderer process by passing messages to the main process.
 */
@Injectable()
export class ElectronBiometricsService extends BiometricsService {
  async supportsBiometric(): Promise<boolean> {
    return await ipc.keyManagement.biometric.osSupported();
  }

  async isBiometricUnlockAvailable(): Promise<boolean> {
    return await ipc.keyManagement.biometric.osSupported();
  }

  /** This method is used to authenticate the user presence _only_.
   * It should not be used in the process to retrieve
   * biometric keys, which has a separate authentication mechanism.
   * For biometric keys, invoke "keytar" with a biometric key suffix */
  async authenticateBiometric(): Promise<boolean> {
    return await ipc.keyManagement.biometric.authenticate();
  }

  async biometricsNeedsSetup(): Promise<boolean> {
    return await ipc.keyManagement.biometric.biometricsNeedsSetup();
  }

  async biometricsSupportsAutoSetup(): Promise<boolean> {
    return await ipc.keyManagement.biometric.biometricsCanAutoSetup();
  }

  async biometricsSetup(): Promise<void> {
    return await ipc.keyManagement.biometric.biometricsSetup();
  }
}
