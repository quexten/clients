use anyhow::{bail, Result};

use zbus::Connection;
use zbus_polkit::policykit1::*;

// Although we use `async-std` here, you can use any async runtime of choice.
async fn authenticate_polkit() -> bool {
    let connection = Connection::system().await.unwrap();
    let proxy = AuthorityProxy::new(&connection).await.unwrap();
    let subject = Subject::new_for_owner(std::process::id(), None, None).unwrap();
    let result = proxy.check_authorization(
        &subject,
        "com.bitwarden.Bitwarden.unlock",
        &std::collections::HashMap::new(),
        CheckAuthorizationFlags::AllowUserInteraction.into(),
        "",
    ).await.unwrap();

    return result.is_authorized
}

async fn polkit_available() -> bool {
    let connection_result = Connection::system().await;
    if connection_result.is_err() {
        return false;
    }
    let connection = connection_result.unwrap();
    let proxy_result = AuthorityProxy::new(&connection).await;
    if proxy_result.is_err() {
        return false;
    }
    return true;   
}

pub async fn prompt(_hwnd: Vec<u8>, _message: String) -> Result<bool> {
    return Ok(authenticate_polkit().await);
}

pub async fn available() -> Result<bool> {
    return Ok(polkit_available().await);
}
