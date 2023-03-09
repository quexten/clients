use anyhow::{bail, Result};

pub async fn prompt(_hwnd: Vec<u8>, _message: String) -> Result<bool> {
    bail!("platform not supported");
}

pub async fn available() -> Result<bool> {
    bail!("platform not supported");
}
