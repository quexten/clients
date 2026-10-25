// MVP, delete with PM-41067
export const AUTOTYPE_MVP_IPC_CHANNELS = {
  TOGGLE: "autofill.toggleAutotypeMvp",
  CONFIGURE: "autofill.configureAutotypeMvp",
  LISTEN: "autofill.listenAutotypeRequestMvp",
  EXECUTION_ERROR: "autofill.autotypeExecutionErrorMvp",
  EXECUTE: "autofill.executeAutotypeMvp",
} as const;

export const SSH_AGENT_IPC_CHANNELS = {
  INIT: "sshagent.init",
  IS_LOADED: "sshagent.isloaded",
  STOP: "sshagent.stop",
  REPLACE: "sshagent.replace",
  LIST_KEYS_REQUEST: "sshagent.listkeysrequest",
  LIST_KEYS_RESPONSE: "sshagent.listkeysresponse",
} as const;

export const MAGNIFY_IPC_CHANNELS = {
  TOGGLE: "autofill.toggleMagnify",
  // Magnify render process -> Main process
  MAGNIFY_COMMAND: "autofill.magnifyCommand",
  // Magnify render process -> Main process: request a window resize
  MAGNIFY_RESIZE: "autofill.magnifyResize",
  // Main process -> BW render process
  MAGNIFY_COMMAND_RELAY: "autofill.magnifyCommandRelay",
  // BW render process -> Main process: the magnify command listener is registered and ready
  MAGNIFY_COMMAND_LISTENER_READY: "autofill.magnifyCommandListenerReady",
  // BW render process -> Main process (for errors)
  MAGNIFY_COMMAND_RELAY_ERROR: "autofill.magnifyCommandRelayError",
  // BW render process -> Main process
  MAGNIFY_COMMAND_RESPONSE: "autofill.magnifyCommandResponse",
  // Magnify render process -> Main process: focus the main BW window and close Magnify
  MAGNIFY_FOCUS_BITWARDEN: "autofill.magnifyFocusBitwarden",
  // Magnify render process -> Main process: dismiss Magnify and return focus to the previous app
  MAGNIFY_DISMISS: "autofill.magnifyDismiss",
} as const;

export const SSH_APPROVAL_IPC_CHANNELS = {
  // Approval render process -> Main process: current mode, request, unlock options and strings
  GET_STATE: "sshApproval.getState",
  // Main process -> Approval render process: the state changed (e.g. unlock -> approve)
  STATE_CHANGED: "sshApproval.stateChanged",
  // Approval render process -> Main process: unlock with a method and optional secret
  UNLOCK: "sshApproval.unlock",
  // Approval render process -> Main process: the user authorized or denied the request
  RESPOND: "sshApproval.respond",
  // Approval render process -> Main process: fit the window to its content height
  RESIZE: "sshApproval.resize",
} as const;
