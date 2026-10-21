//! Gemini's native REST contract. Keep provider-specific fields out of shared requests.
use anyhow::{bail, Result};
use serde_json::{json, Value};

pub(crate) fn path(model: &str, streaming: bool) -> Result<String> {
    let model = model.trim().strip_prefix("models/").unwrap_or(model.trim());
    if model.is_empty()
        || model.len() > 200
        || !model
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
    {
        bail!("Enter a Gemini model ID, not a URL or display name");
    }
    Ok(format!(
        "/models/{model}:{}",
        if streaming {
            "streamGenerateContent?alt=sse"
        } else {
            "generateContent"
        }
    ))
}

pub(crate) fn body(
    system: &str,
    prompt: &str,
    output_limit: usize,
    schema: Option<&Value>,
) -> Value {
    let mut body = json!({
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"maxOutputTokens": output_limit}
    });
    if let Some(schema) = schema {
        body["generationConfig"]["responseMimeType"] = json!("application/json");
        body["generationConfig"]["responseJsonSchema"] = wire_schema(schema);
    }
    body
}

// Gemini's generation schema is a subset of JSON Schema. Keep unsupported string
// constraints as guidance; callers validate the original, unmodified schema.
// Only recurse through schema positions: a property named "pattern" is valid data.
fn wire_schema(schema: &Value) -> Value {
    let mut result = schema.clone();
    let Some(object) = result.as_object_mut() else {
        return result;
    };
    if let Some(pattern) = object.remove("pattern") {
        if let Some(pattern) = pattern.as_str() {
            let description = object
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or("");
            object.insert(
                "description".into(),
                json!(format!("{description} Must match this pattern: {pattern}").trim()),
            );
        }
    }
    // A large bounded array expands the provider's constrained-decoding grammar.
    // Keep the count as guidance and enforce the actual limit in the application.
    for keyword in ["minLength", "maxLength", "maxItems"] {
        if let Some(limit) = object.remove(keyword) {
            let description = object
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or("");
            object.insert(
                "description".into(),
                json!(format!("{description} {keyword}: {limit}.").trim()),
            );
        }
    }
    for keyword in ["properties", "$defs", "definitions"] {
        if let Some(children) = object.get_mut(keyword).and_then(Value::as_object_mut) {
            for child in children.values_mut() {
                *child = wire_schema(child);
            }
        }
    }
    for keyword in ["items", "additionalProperties"] {
        if let Some(child) = object.get_mut(keyword) {
            *child = wire_schema(child);
        }
    }
    for keyword in ["anyOf", "oneOf", "allOf", "prefixItems"] {
        if let Some(children) = object.get_mut(keyword).and_then(Value::as_array_mut) {
            for child in children {
                *child = wire_schema(child);
            }
        }
    }
    result
}

// A streaming chunk may omit finishReason. A buffered response must end in STOP.
pub(crate) fn text(value: &Value, streaming: bool) -> Result<String> {
    let candidate = &value["candidates"][0];
    match candidate["finishReason"].as_str() {
        Some("STOP") => (),
        Some("MAX_TOKENS") => bail!("Model output was truncated; try a smaller request or increase output capacity"),
        Some(_) => bail!("Gemini did not complete the response. No changes were applied. Try rephrasing the request."),
        None if streaming && value["promptFeedback"]["blockReason"].is_null() => (),
        None => bail!("Gemini returned no completed response. No changes were applied."),
    }
    Ok(candidate["content"]["parts"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|part| part["thought"] != true)
        .filter_map(|part| part["text"].as_str())
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_request_keeps_structure_and_uses_supported_schema_constraints() {
        let schema: Value =
            serde_json::from_str(include_str!("../../../schemas/calendar-tasks.schema.json"))
                .unwrap();
        let request = body(
            "system",
            "two calendar names are just text",
            4096,
            Some(&schema),
        );
        let wire = &request["generationConfig"]["responseJsonSchema"];
        assert!(wire["properties"]["tasks"].get("maxItems").is_none());
        assert!(wire["properties"]["tasks"]["description"]
            .as_str()
            .unwrap()
            .contains("maxItems: 64"));
        assert_eq!(schema["properties"]["tasks"]["maxItems"], 64);
        assert_eq!(
            wire["properties"]["tasks"]["items"]["required"],
            schema["properties"]["tasks"]["items"]["required"]
        );
        assert_eq!(
            wire["properties"]["tasks"]["items"]["additionalProperties"],
            false
        );
        let date = &wire["properties"]["tasks"]["items"]["properties"]["date"];
        assert!(date.get("pattern").is_none());
        assert!(date["description"].as_str().unwrap().contains("^[0-9]{4}"));
        assert!(schema["properties"]["tasks"]["items"]["properties"]["date"]
            .get("pattern")
            .is_some());
        assert_eq!(
            request["generationConfig"]["responseMimeType"],
            "application/json"
        );
        assert_eq!(request["generationConfig"]["maxOutputTokens"], 4096);
        assert_eq!(
            request["contents"][0]["parts"][0]["text"],
            "two calendar names are just text"
        );
        for field in [
            "model",
            "messages",
            "response_format",
            "max_tokens",
            "temperature",
            "top_p",
            "top_k",
            "stream",
        ] {
            assert!(request.get(field).is_none());
            assert!(request["generationConfig"].get(field).is_none());
        }
        assert!(body("system", "chat", 2048, None)["generationConfig"]
            .get("responseJsonSchema")
            .is_none());
    }

    #[test]
    fn schema_projection_preserves_data_properties_named_pattern() {
        let original = json!({"type":"object", "properties":{"pattern":{"type":"string","pattern":"^a$"},"enum":{"type":"string","enum":["pattern"]}}});
        let projected = wire_schema(&original);
        assert_eq!(projected["properties"]["pattern"]["type"], "string");
        assert_eq!(
            projected["properties"]["enum"],
            original["properties"]["enum"]
        );
        assert!(projected["properties"]["pattern"].get("pattern").is_none());
        assert_eq!(original["properties"]["pattern"]["pattern"], "^a$");
    }

    #[test]
    fn model_ids_cannot_change_the_endpoint_or_query() {
        assert_eq!(
            path(" models/gemini-3.6-flash ", false).unwrap(),
            "/models/gemini-3.6-flash:generateContent"
        );
        assert_eq!(
            path("gemini-3.8-flash", true).unwrap(),
            "/models/gemini-3.8-flash:streamGenerateContent?alt=sse"
        );
        for id in [
            "",
            "../models/a",
            "x?key=secret",
            "https://example.com",
            "model name",
            "x:generateContent",
            "x%2fy",
        ] {
            assert!(path(id, false).is_err());
        }
    }

    #[test]
    fn reads_all_text_parts_but_excludes_thoughts() {
        let response = json!({"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"hidden","thought":true},{"text":"{\"ok\":"},{"text":"true}"}]}}]});
        assert_eq!(text(&response, false).unwrap(), "{\"ok\":true}");
    }

    #[test]
    fn rejects_truncated_blocked_or_incomplete_responses() {
        for reason in ["MAX_TOKENS", "SAFETY", "RECITATION", "CONTINUATION"] {
            let response = json!({"candidates":[{"finishReason":reason,"content":{"parts":[{"text":"partial"}]}}]});
            assert!(text(&response, false).is_err());
            assert!(text(&response, true).is_err());
        }
        assert!(text(&json!({"promptFeedback":{"blockReason":"SAFETY"}}), true).is_err());
        assert!(text(&json!({}), false).is_err());
        assert_eq!(
            text(
                &json!({"candidates":[{"content":{"parts":[{"text":"chunk"}]}}]}),
                true
            )
            .unwrap(),
            "chunk"
        );
    }
}
