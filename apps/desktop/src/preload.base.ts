import tools from "./app/tools/preload";
import auth from "./auth/preload";
import autofill from "./autofill/preload";
import keyManagement from "./key-management/preload";
import platform from "./platform/preload";
import vault from "./vault/preload";

export const ipc = {
  auth,
  autofill,
  platform,
  keyManagement,
  tools,
  vault,
};
