use keyring::Entry;

const SERVICE_NAME: &str = "com.yones.ide";

pub struct SecretManager;

impl SecretManager {
    pub fn get_key(provider: &str) -> Result<String, String> {
        // Fallback to environment variable if set
        if provider == "anthropic" {
            if let Ok(val) = std::env::var("ANTHROPIC_API_KEY") {
                if !val.is_empty() {
                    return Ok(val);
                }
            }
            if let Ok(val) = std::env::var("ANTHROPIC_AUTH_TOKEN") {
                if !val.is_empty() {
                    return Ok(val);
                }
            }
        } else if provider == "openai" {
            if let Ok(val) = std::env::var("OPENAI_API_KEY") {
                if !val.is_empty() {
                    return Ok(val);
                }
            }
        }

        let entry = Entry::new(SERVICE_NAME, provider).map_err(|e| e.to_string())?;
        entry.get_password().map_err(|e| e.to_string())
    }

    pub fn set_key(provider: &str, secret: &str) -> Result<(), String> {
        let entry = Entry::new(SERVICE_NAME, provider).map_err(|e| e.to_string())?;
        entry.set_password(secret).map_err(|e| e.to_string())
    }

    pub fn delete_key(provider: &str) -> Result<(), String> {
        let entry = Entry::new(SERVICE_NAME, provider).map_err(|e| e.to_string())?;
        entry.delete_password().map_err(|e| e.to_string())
    }
}
