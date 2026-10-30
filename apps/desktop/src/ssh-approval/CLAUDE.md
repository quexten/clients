# SSH approval

Small window that unlocks the vault and approves SSH agent requests. It runs as a **separate
renderer process** with its own Angular app and webpack build, like `src/magnify`.

## Critical Rules

- **NEVER** use NgModule — all components must be standalone
- Keep this app **lightweight**: no `@bitwarden` libs, no i18n. The main process sends localized
  strings with the state (`SshApprovalState.strings`).
- The window talks only to the main process (`MainSshApprovalWindowService`). Unlock runs in main;
  the key never reaches this renderer.

## NX Commands

```bash
nx run desktop:build-ssh-approval
nx run desktop:test-ssh-approval
```
