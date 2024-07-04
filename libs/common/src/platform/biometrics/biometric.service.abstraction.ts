export abstract class BiometricsServiceAbstraction {
  abstract supportsBiometric(): Promise<boolean>;
  abstract isBiometricUnlockAvailable(): Promise<boolean>;
  abstract authenticateBiometric(): Promise<boolean>;
}
