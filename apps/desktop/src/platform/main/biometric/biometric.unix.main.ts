import { spawn } from "child_process";

import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { biometrics, passwords } from "@bitwarden/desktop-native";

import { WindowMain } from "../../../main/window.main";
import { isFlatpak, isLinux, isSnapStore } from "../../../utils";

import { OsBiometricService } from "./biometrics.service.abstraction";

const polkitPolicy = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE policyconfig PUBLIC
 "-//freedesktop//DTD PolicyKit Policy Configuration 1.0//EN"
 "http://www.freedesktop.org/standards/PolicyKit/1.0/policyconfig.dtd">

<policyconfig>
    <action id="com.bitwarden.Bitwarden.unlock">
      <description>Unlock Bitwarden</description>
      <message>Authenticate to unlock Bitwarden</message>
      <defaults>
        <allow_any>no</allow_any>
        <allow_inactive>no</allow_inactive>
        <allow_active>auth_self</allow_active>
      </defaults>
    </action>
</policyconfig>`;
const policyFileName = "com.bitwarden.Bitwarden.policy";
const policyPath = "/usr/share/polkit-1/actions/";

export default class BiometricUnixMain implements OsBiometricService {
  constructor(
    private i18nservice: I18nService,
    private windowMain: WindowMain,
  ) {}

  async setBiometricKey(service: string, key: string, value: string): Promise<void> {
    return await passwords.setPassword(service, key, value);
  }
  async deleteBiometricKey(service: string, key: string): Promise<void> {
    await passwords.deletePassword(service, key);
  }

  async getBiometricKey(service: string, key: string): Promise<string> {
    const success = await this.authenticateBiometric();

    if (!success) {
      throw new Error("Biometric authentication failed");
    }

    return await passwords.getPassword(service, key);
  }

  async authenticateBiometric(): Promise<boolean> {
    const hwnd = this.windowMain.win.getNativeWindowHandle();
    return await biometrics.prompt(hwnd, this.i18nservice.t("polkitConsentMessage"));
  }

  async osSupportsBiometric(): Promise<boolean> {
    return true;
  }

  async osBiometricsNeedsSetup(): Promise<boolean> {
    // check whether the polkit policy is loaded via dbus call to polkit
    return !(await biometrics.available());
  }

  async osBiometricsCanAutoSetup(): Promise<boolean> {
    // We cannot auto setup on snap or flatpak since the filesystem is sandboxed.
    // The user needs to manually set up the polkit policy outside of the sandbox
    // since we allow access to polkit via dbus for the sandboxed clients, the authentication works from
    // the sandbox, once the policy is set up outside of the sandbox.
    return isLinux() && !isSnapStore() && !isFlatpak();
  }

  async osBiometricsSetup(): Promise<void> {
    let process = spawn("pkexec", [
      "bash",
      "-c",
      `echo '${polkitPolicy}' > ${policyPath + policyFileName}`,
    ]);

    await new Promise((resolve, reject) => {
      process.on("close", (code) => {
        if (code !== 0) {
          reject("Failed to set up polkit policy");
        } else {
          process = spawn("pkexec", ["chown", "root:root", policyPath + policyFileName]);
          process.on("close", (code) => {
            if (code !== 0) {
              reject("Failed to change polkit policy permissions");
            } else {
              // selinux requires labeling
              process = spawn("pkexec", [
                "chcon",
                "system_u:object_r:usr_t:s0",
                policyPath + policyFileName,
              ]);
              // fail silently
              resolve(null);
            }
          });
        }
      });
    });
  }
}
