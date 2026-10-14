/* eslint-disable @typescript-eslint/no-require-imports, no-console */
// Local ad-hoc macOS signer.
//
// Bitwarden's CI injects its own `sign-macos.js` that routes through the signing service using a
// Developer ID identity. This local copy instead ad-hoc-signs the app (`identity: "-"`) so it can
// run on the machine that built it, with no provisioning profile or Apple signing certificate.
const { signAsync } = require("@electron/osx-sign");

/**
 * @param {import("electron-builder").Packager} _packager
 */
async function sign(opts) {
  await signAsync({
    ...opts,
    // Ad-hoc sign with the pseudo-identity "-" and skip keychain discovery/validation, since this
    // local build has no Developer ID certificate or provisioning profile.
    identity: "-",
    identityValidation: false,
    // electron-builder's `optionsForFile` (set on `opts` above) applies the CI entitlements
    // (`resources/entitlements.mac.plist`), which declare a Developer ID team
    // (`com.apple.developer.team-identifier` / `com.apple.application-identifier`). An ad-hoc
    // signature has no certificate, so it cannot legitimately carry those restricted entitlements;
    // embedding them makes the code-signing subsystem reject the app at launch ("Launchd job spawn
    // failed"). Drop the per-file entitlements override so osx-sign falls back to its built-in
    // Electron defaults, which carry no team ID.
    //
    // Hardened runtime is likewise incompatible with ad-hoc signing: it enables library validation,
    // which requires a team ID and force-kills the process (SIGKILL) when one is absent. And an
    // ad-hoc signature has no certificate chain, so don't contact Apple's timestamp server.
    optionsForFile: () => ({ hardenedRuntime: false, timestamp: "none" }),
  });
}

exports.default = sign;
exports.sign = sign;
