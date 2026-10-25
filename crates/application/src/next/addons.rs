use super::*;
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProgramAddon {
    pub format: String,
    pub version: u32,
    pub id: String,
    pub name: String,
    pub description: String,
    pub runtime: String,
    pub source: String,
    pub input_schema: Value,
    pub output_schema: Value,
    pub capabilities: Vec<String>,
}
impl ProgramAddon {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            self.format == "consilium-addon" && self.version == 1,
            "Unsupported add-on format"
        );
        ensure!(
            !self.id.is_empty()
                && self.id.len() <= 80
                && self
                    .id
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'),
            "Invalid add-on ID"
        );
        ensure!(
            !self.name.trim().is_empty()
                && self.source.len() <= 100_000
                && !self.source.trim().is_empty(),
            "Add-on needs a name and up to 100 KB of program source"
        );
        ensure!(
            ["node", "python", "godot"].contains(&self.runtime.as_str()),
            "Choose Node, Python or Godot runtime"
        );
        ensure!(
            self.capabilities.len() <= 20,
            "Too many declared capabilities"
        );
        jsonschema::validator_for(&self.input_schema)
            .map_err(|e| anyhow::anyhow!("Input schema: {e}"))?;
        jsonschema::validator_for(&self.output_schema)
            .map_err(|e| anyhow::anyhow!("Output schema: {e}"))?;
        Ok(())
    }
}
impl Engine {
    pub fn addon_action(&self, action: &str, p: Value) -> Result<Value> {
        match action {
            "next_addon_samples" => {
                let mut samples = vec![];
                for text in [
                    include_str!("../../../../examples/addons/ml-regression.consilium-addon.json"),
                    include_str!("../../../../examples/addons/godot-scene.consilium-addon.json"),
                ] {
                    let addon: ProgramAddon = serde_json::from_str(text)?;
                    addon.validate()?;
                    samples.push(
                        json!({"manifest":addon,"digest":consilium_workflow::digest(&addon)?}),
                    );
                }
                Ok(json!(samples))
            }
            "next_addon_example" => {
                let addon = self.next_get::<Value>("addon", field(&p, "id")?)?.value;
                ensure!(addon["enabled"] == true, "Install the add-on first");
                let id = consilium_domain::id();
                let input = if addon["id"] == "ml-regression" {
                    json!({"rows":(0..12).map(|x|json!({"x":x,"y":2*x+1})).collect::<Vec<_>>()})
                } else {
                    json!({"count":8})
                };
                let n = json!({"schema_version":1,"id":id,"name":format!("{} example",addon["name"].as_str().unwrap_or("Add-on")),"limits":consilium_workflow::Limits::default(),"nodes":[
                    {"id":"input","kind":"input","title":"Example data","config":{"value":input},"position":{"x":0,"y":120}},
                    {"id":"adapter","kind":"addon","title":addon["name"],"config":{"addon_id":addon["id"],"executable_binding":"","timeout_seconds":300},"position":{"x":240,"y":120}},
                    {"id":"report","kind":"document_write","title":"Save report","config":{"title":format!("{} report",addon["name"].as_str().unwrap_or("Experiment"))},"position":{"x":500,"y":0}},
                    {"id":"output","kind":"output","title":"Model / scene output","config":{},"position":{"x":500,"y":240}}
                ],"edges":[{"id":"a","source":"input","target":"adapter"},{"id":"b","source":"adapter","target":"report"},{"id":"c","source":"adapter","target":"output"}]});
                self.store.write(&key("network", &id), 0, &n)?;
                Ok(json!(self.next_get::<Value>("network", &id)?))
            }
            "next_addon_inspect" => {
                let path = std::path::Path::new(field(&p, "path")?);
                ensure!(
                    std::fs::metadata(path)?.len() <= 200_000,
                    "Add-on manifest exceeds 200 KB"
                );
                let addon: ProgramAddon = serde_json::from_slice(&std::fs::read(path)?)?;
                addon.validate()?;
                Ok(
                    json!({"digest":consilium_workflow::digest(&addon)?,"manifest":addon,"warning":"Trusted native code: capabilities are declarations, not a sandbox. No installation scripts run. Review source before installing."}),
                )
            }
            "next_addon_install" => {
                ensure!(
                    p["approved"] == true,
                    "Review source before installing this add-on"
                );
                let addon: ProgramAddon = decode(p["manifest"].clone())?;
                addon.validate()?;
                ensure!(
                    p["digest"] == consilium_workflow::digest(&addon)?,
                    "Manifest changed after review"
                );
                let old = self.store.read::<Value>(&key("addon", &addon.id))?;
                let value = json!({"id":addon.id,"name":addon.name,"enabled":true,"manifest":addon,"digest":p["digest"]});
                self.store.write(
                    &key("addon", field(&value, "id")?),
                    old.map_or(0, |r| r.revision),
                    &value,
                )?;
                Ok(value)
            }
            "next_addon_remove" => {
                let id = field(&p, "id")?;
                let mut r = self.next_get::<Value>("addon", id)?;
                r.value["enabled"] = json!(false);
                self.store.write(&key("addon", id), r.revision, &r.value)?;
                Ok(json!({"disabled":true,"outputs_preserved":true}))
            }
            _ => bail!("Unknown add-on action"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use consilium_storage::Store;
    #[test]
    fn install_is_reviewed_and_does_not_execute_source() {
        let d = tempfile::tempdir().unwrap();
        let e = Engine::new(Store::new(d.path().into()).unwrap());
        let sample = e.addon_action("next_addon_samples", json!({})).unwrap()[0].clone();
        let mut request = sample.clone();
        request["approved"] = json!(false);
        assert!(e
            .addon_action("next_addon_install", request.clone())
            .is_err());
        request["approved"] = json!(true);
        request["manifest"]["source"] = json!("modified after review");
        assert!(e.addon_action("next_addon_install", request).is_err());
        let mut request = sample;
        request["approved"] = json!(true);
        e.addon_action("next_addon_install", request).unwrap();
        assert!(e.next_list("run").unwrap().is_empty());
        let result = e
            .addon_action("next_addon_remove", json!({"id":"ml-regression"}))
            .unwrap();
        assert_eq!(result["outputs_preserved"], true);
        assert_eq!(
            e.next_get::<Value>("addon", "ml-regression").unwrap().value["enabled"],
            false
        );
    }
}
