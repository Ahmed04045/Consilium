//! Provider-neutral estimates, not model-specific tokenizer counts.
use serde_json::Value;

/// ASCII word runs average at most three characters per estimated token;
/// punctuation and non-ASCII UTF-8 bytes are counted conservatively. This is
/// intentionally a heuristic: providers remain authoritative about token use.
pub fn estimate_tokens(text: &str) -> usize {
    let mut tokens = 0usize;
    let mut run = 0usize;
    for c in text.chars() {
        if c.is_ascii_alphanumeric() {
            run += 1;
        } else {
            tokens += run.div_ceil(3);
            run = 0;
            tokens += if c.is_ascii_whitespace() {
                0
            } else if c.is_ascii() {
                1
            } else {
                c.len_utf8()
            };
        }
    }
    tokens
        + run.div_ceil(3)
        + text
            .chars()
            .filter(|c| c.is_ascii_whitespace())
            .count()
            .div_ceil(4)
}
pub fn request_tokens(system: &str, prompt: &str, schema: Option<&Value>) -> usize {
    estimate_tokens(system)
        + estimate_tokens(prompt)
        + schema.map_or(0, |s| estimate_tokens(&s.to_string()))
        + 128
}
pub fn safety_tokens(window: usize) -> usize {
    (window / 20).clamp(256, 2048)
}
pub fn output_tokens(window: usize, provider: &str, schema: Option<&Value>) -> usize {
    let desired = if schema.is_some_and(|s| s["properties"]["tasks"]["maxItems"] == 64) {
        12288
    } else if super::cloud(provider) {
        4096
    } else {
        2048
    };
    desired.min(window / 3).max(512)
}
pub fn input_budget(window: usize, provider: &str, schema: Option<&Value>) -> usize {
    window.saturating_sub(output_tokens(window, provider, schema) + safety_tokens(window))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn estimates_are_not_bytes_and_cover_unicode_and_schema() {
        let text = "A detailed conversation about network validation. ".repeat(100);
        assert!(estimate_tokens(&text) < text.len() / 2);
        assert!(estimate_tokens("学习🧠") >= 3);
        assert!(estimate_tokens("{}[]:,") >= 6);
        assert!(
            request_tokens("s", "p", Some(&serde_json::json!({"type":"object"})))
                > request_tokens("s", "p", None)
        );
    }
    #[test]
    fn reserves_fit_small_and_large_windows() {
        for window in [2048, 4096, 8192, 32768, 131072] {
            let budget = input_budget(window, "gemini", None);
            assert_eq!(
                budget + output_tokens(window, "gemini", None) + safety_tokens(window),
                window
            );
            assert!(budget > 0);
        }
    }
}
