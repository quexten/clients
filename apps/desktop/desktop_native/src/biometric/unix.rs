use anyhow::{bail, Result};
use pam_client::{Context, Flag};
use pam_client::conv_cli::Conversation;
use whoami;

pub fn prompt(_hwnd: Vec<u8>, _message: String) -> Result<bool> {
    let mut context =Context::new(
        "bitwarden", 
        Some(&whoami::username()),
        Conversation::new()
    ).expect("Failed to initialize PAM context");

    let result = context.authenticate(Flag::NONE);
    if result.is_err() {
        println!("Authentication failed");
        println!("Error: {:?}", result.err().unwrap());
        return Ok(false);
    } else {
        println!("Authentication succeeded");
        return Ok(true);
    }
}

pub fn available() -> Result<bool> {
    return Ok(true); //todo: check availability
}
