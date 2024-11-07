use anyhow::{anyhow, Result};
use std::collections::HashMap;

pub async fn get_password(service: &str, account: &str) -> Result<String> {
    let keyring = oo7::Keyring::new().await?;
    let attributes = HashMap::from([("service", service), ("account", account)]);
    let results = keyring.search_items(&attributes).await?;
    let res = results.get(0);
    match res {
        Some(res) => {
            let secret = res.secret().await?;
            println!("res {:?}", secret.to_vec());
            Ok(String::from_utf8(secret.to_vec())?)
        },
        None => Err(anyhow!("no result"))
    }
}

pub async fn set_password(service: &str, account: &str, password: &str) -> Result<()> {
    let keyring = oo7::Keyring::new().await?;
    let attributes = HashMap::from([("service", service), ("account", account)]);
    keyring.create_item("org.freedesktop.Secret.Generic", &attributes, password, true).await?;
    Ok(())
}

pub async fn delete_password(service: &str, account: &str) -> Result<()> {
    let keyring = oo7::Keyring::new().await?;
    let attributes = HashMap::from([("service", service), ("account", account)]);
    keyring.delete(&attributes).await?;
    Ok(())
}

pub async fn is_available() -> Result<bool> {
    match oo7::Keyring::new().await {
        Ok(_) => Ok(true),
        _ => Ok(false),
    }
}
