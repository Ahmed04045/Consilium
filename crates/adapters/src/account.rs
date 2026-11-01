use anyhow::{bail, ensure, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
#[derive(Clone, Serialize, Deserialize)]
pub struct AccountConfig {
    pub project_url: String,
    pub public_key: String,
}
impl AccountConfig {
    pub fn validate(&self) -> Result<()> {
        let u = url::Url::parse(&self.project_url)?;
        if u.scheme() != "https"
            || !u.host_str().is_some_and(|h| h.ends_with(".supabase.co"))
            || u.path() != "/"
            || u.query().is_some()
            || u.fragment().is_some()
            || !u.username().is_empty()
            || u.password().is_some()
            || u.port().is_some()
        {
            bail!("Use your https://PROJECT.supabase.co project URL");
        }
        if !self.public_key.starts_with("sb_publishable_") {
            bail!("Use a Supabase publishable key (sb_publishable_), never a secret or service-role key");
        }
        Ok(())
    }
    fn entry(&self) -> Result<keyring::Entry> {
        self.validate()?;
        Ok(keyring::Entry::new(
            "ConsiliumNext",
            &format!("account-{}", self.project_url.trim_end_matches('/')),
        )?)
    }
    pub fn connected(&self) -> bool {
        self.entry()
            .ok()
            .and_then(|e| e.get_password().ok())
            .is_some()
    }
    pub fn email(&self) -> Option<String> {
        self.entry()
            .ok()
            .and_then(|e| e.get_password().ok())
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
            .and_then(|v| v["email"].as_str().map(String::from))
    }
    pub fn disconnect(&self) -> Result<()> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.into()),
        }
    }
}
static AUTH_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
pub async fn call(
    c: &AccountConfig,
    path: &str,
    token: Option<&str>,
    body: Option<Value>,
) -> Result<Value> {
    c.validate()?;
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .build()?;
    let url = format!("{}{}", c.project_url.trim_end_matches('/'), path);
    let mut request = if let Some(body) = body {
        client.post(url).json(&body)
    } else {
        client.get(url)
    }
    .header("apikey", &c.public_key);
    if let Some(token) = token {
        request = request.bearer_auth(token)
    }
    let mut response = request
        .send()
        .await
        .context("Could not reach account service")?;
    if response.status().as_u16() == 429 {
        bail!("Too many account requests. Try again in a minute.");
    }
    if response.status().as_u16() == 409 {
        bail!("Another device changed the calendar. Preview sync again.");
    }
    if !response.status().is_success() {
        let status = response.status();
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await? {
            if bytes.len() + chunk.len() > 8_192 {
                break;
            }
            bytes.extend_from_slice(&chunk);
        }
        let error: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        if error["error_code"] == "invalid_credentials" {
            bail!("Email or password is incorrect.");
        }
        if error["error_code"] == "email_not_confirmed" {
            bail!("Confirm your email before signing in.");
        }
        let detail = error["msg"]
            .as_str()
            .or_else(|| error["message"].as_str())
            .or_else(|| error["error_description"].as_str());
        if let Some(detail) = detail.filter(|message| message.len() <= 300) {
            bail!("Account service rejected the request: {detail}");
        }
        bail!("Account service returned HTTP {status}. Check the account service settings and try again.");
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        if bytes.len() + chunk.len() > 6_000_000 {
            bail!("Account response exceeds limit");
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(serde_json::from_slice(&bytes).context("Invalid account response")?)
}
pub async fn login(c: &AccountConfig, email: &str, password: &str, signup: bool) -> Result<Value> {
    let email = email.trim();
    if email.len() > 254 || !email.contains('@') || password.is_empty() || password.len() > 1024 {
        bail!("Enter a valid email and password");
    }
    if signup && password.len() < 12 {
        bail!("Use at least 12 characters for your password");
    }
    let _lock = AUTH_LOCK.lock().await;
    let path = if signup {
        "/auth/v1/signup"
    } else {
        "/auth/v1/token?grant_type=password"
    };
    let v = call(
        c,
        path,
        None,
        Some(json!({"email":email,"password":password})),
    )
    .await?;
    if signup && v["access_token"].as_str().is_none() {
        return Ok(json!({
            "connected": false,
            "message": "Account request submitted. Check your email to confirm, then sign in."
        }));
    }
    let access = v["access_token"]
        .as_str()
        .context("Account service returned an incomplete sign-in response")?;
    let refresh = v["refresh_token"]
        .as_str()
        .context("Account service returned an incomplete sign-in response")?;
    let user_id = v["user"]["id"]
        .as_str()
        .context("Account service returned an incomplete sign-in response")?;
    ensure!(
        !access.is_empty() && !refresh.is_empty() && !user_id.is_empty(),
        "Account service returned an incomplete sign-in response"
    );
    c.entry()?.set_password(
        &json!({"refresh_token":refresh,"email":v["user"]["email"],"user_id":user_id}).to_string(),
    )?;
    Ok(json!({"connected":true}))
}
pub async fn session(c: &AccountConfig) -> Result<(String, String)> {
    let _lock = AUTH_LOCK.lock().await;
    let entry = c.entry()?;
    let saved: Value = serde_json::from_str(&entry.get_password().context("Sign in to sync")?)?;
    let refresh = saved["refresh_token"].as_str().context("Sign in again")?;
    let v = call(
        c,
        "/auth/v1/token?grant_type=refresh_token",
        None,
        Some(json!({"refresh_token":refresh})),
    )
    .await?;
    let (access, refresh, user) = session_fields(&v, saved["user_id"].as_str())?;
    entry.set_password(
        &json!({"refresh_token":refresh,"email":v["user"]["email"],"user_id":user}).to_string(),
    )?;
    Ok((access.into(), user.into()))
}
fn session_fields<'a>(
    v: &'a Value,
    expected_user: Option<&str>,
) -> Result<(&'a str, &'a str, &'a str)> {
    let access = v["access_token"]
        .as_str()
        .filter(|s| !s.trim().is_empty())
        .context("Account service returned an incomplete session")?;
    let refresh = v["refresh_token"]
        .as_str()
        .filter(|s| !s.trim().is_empty())
        .context("Account service returned an incomplete session")?;
    let user = v["user"]["id"]
        .as_str()
        .filter(|s| !s.trim().is_empty())
        .context("Account service returned an incomplete session")?;
    ensure!(
        expected_user.is_none_or(|expected| expected == user),
        "Account identity changed. Sign in again."
    );
    Ok((access, refresh, user))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invalid_refresh_never_becomes_a_saved_session() {
        let valid = json!({"access_token":"access","refresh_token":"refresh","user":{"id":"a"}});
        assert!(session_fields(&valid, Some("a")).is_ok());
        assert!(session_fields(&valid, Some("b")).is_err());
        for field in ["access_token", "refresh_token", "user"] {
            let mut invalid = valid.clone();
            invalid[field] = Value::Null;
            assert!(session_fields(&invalid, Some("a")).is_err());
        }
        let mut blank = valid;
        blank["refresh_token"] = json!(" ");
        assert!(session_fields(&blank, None).is_err());
    }
    #[test]
    fn only_public_host_and_publishable_key() {
        let good = AccountConfig {
            project_url: "https://example.supabase.co".into(),
            public_key: "sb_publishable_test".into(),
        };
        assert!(good.validate().is_ok());
        assert!(AccountConfig {
            project_url: "http://example.supabase.co".into(),
            ..good.clone()
        }
        .validate()
        .is_err());
        assert!(AccountConfig {
            public_key: "sb_secret_bad".into(),
            ..good
        }
        .validate()
        .is_err());
    }
}
