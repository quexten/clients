pub mod client;
pub mod server;

/// The maximum size of a message that can be sent over IPC.
/// According to the documentation, the maximum size sent to the browser is 1MB.
/// While the maximum size sent from the browser to the native messaging host is 4GB.
///
/// Currently we are setting the maximum both ways to be 1MB.
///
/// https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging#app_side
/// https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging#native-messaging-host-protocol
pub const NATIVE_MESSAGING_BUFFER_SIZE: usize = 1024 * 1024;

/// The maximum number of messages that can be buffered in a channel.
/// This number is more or less arbitrary and can be adjusted as needed,
/// but ideally the messages should be processed as quickly as possible.
pub const MESSAGE_CHANNEL_BUFFER: usize = 32;

/// Resolve the path to the IPC socket.
pub fn path(name: &str) -> std::path::PathBuf {
    #[cfg(target_os = "windows")]
    {
        // Use a unique IPC pipe //./pipe/xxxxxxxxxxxxxxxxx.app.bitwarden per user.
        // Hashing prevents problems with reserved characters and file length limitations.
        use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
        use sha2::Digest;
        let home = dirs::home_dir().unwrap();
        let hash = sha2::Sha256::digest(home.as_os_str().as_encoded_bytes());
        let hash_b64 = URL_SAFE_NO_PAD.encode(hash.as_slice());

        format!(r"\\.\pipe\{hash_b64}.app.{name}").into()
    }

    #[cfg(all(target_os = "macos", not(debug_assertions)))]
    {
        let mut home = dirs::home_dir().unwrap();

        // When running in an unsandboxed environment, path is: /Users/<user>/
        // While running sandboxed, it's different: /Users/<user>/Library/Containers/com.bitwarden.desktop/Data
        //
        // We want to use App Groups in /Users/<user>/Library/Group Containers/LTZ2PFU5D6.com.bitwarden.desktop,
        // so we need to remove all the components after the user.
        // Note that we subtract 3 because the root directory is counted as a component (/, Users, <user>).
        let num_components = home.components().count();
        for _ in 0..num_components - 3 {
            home.pop();
        }

        let tmp = home.join("Library/Group Containers/LTZ2PFU5D6.com.bitwarden.desktop/tmp");

        // The tmp directory might not exist, so create it
        let _ = std::fs::create_dir_all(&tmp);
        tmp.join(format!("app.{name}"))
    }

    #[cfg(all(target_os = "macos", debug_assertions))]
    {
        // When running in debug mode, we use the tmp dir because the app is not sandboxed
        let dir = std::env::temp_dir();
        dir.join(format!("app.{name}"))
    }

    #[cfg(target_os = "linux")]
    {
        // On Linux, we use the user's cache directory.
        let home = dirs::cache_dir().unwrap();
        let path_dir = home.join("com.bitwarden.desktop");

        // The chache directory might not exist, so create it
        let _ = std::fs::create_dir_all(&path_dir);
        path_dir.join(format!("app.{name}"))
    }
}
