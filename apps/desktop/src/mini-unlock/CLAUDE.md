# Mini unlock

Standalone unlock component (master password, PIN, biometrics) shared by the lightweight
mini-window apps (`src/magnify`, `src/ssh-approval`).

- No `@bitwarden` libs, no i18n: strings come in through the `strings` input.
- The host app provides `MiniUnlockClient` over its preload bridge; unlock runs in the main
  process (`MainMiniUnlockService`) and the key never reaches the renderer.
- Styles are self-contained, so hosts need no global CSS.
