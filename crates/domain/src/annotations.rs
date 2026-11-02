//! Visual marks are data, never executable workflow configuration.
use anyhow::{ensure, Result};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Mark {
    pub id: String,
    pub tool: String,
    pub color: String,
    pub width: f64,
    pub points: Vec<[f64; 2]>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AnnotationBoard {
    pub id: String,
    pub schema_version: u32,
    pub owner_kind: String,
    pub owner_id: String,
    pub view_key: String,
    pub space: String,
    pub marks: Vec<Mark>,
}
impl AnnotationBoard {
    pub fn validate(&self) -> Result<()> {
        ensure!(self.schema_version == 1, "Unsupported drawing format");
        ensure!(
            ["calendar", "network"].contains(&self.owner_kind.as_str()),
            "Invalid drawing owner"
        );
        ensure!(
            !self.owner_id.is_empty() && self.owner_id.len() <= 180,
            "Invalid drawing owner ID"
        );
        ensure!(
            !self.view_key.is_empty()
                && self.view_key.len() <= 80
                && !self.view_key.chars().any(char::is_control),
            "Invalid drawing view"
        );
        ensure!(
            (self.owner_kind == "network" && self.space == "world" && self.view_key == "canvas")
                || (self.owner_kind == "calendar" && self.space == "normalized"),
            "Invalid drawing coordinate space"
        );
        ensure!(self.marks.len() <= 300, "Drawing has more than 300 marks");
        let mut ids = std::collections::HashSet::new();
        let mut points = 0;
        for m in &self.marks {
            ensure!(
                !m.id.is_empty() && m.id.len() <= 80 && ids.insert(&m.id),
                "Invalid or duplicate mark ID"
            );
            ensure!(
                ["pen", "highlight"].contains(&m.tool.as_str()),
                "Unknown drawing tool"
            );
            ensure!(
                m.color.len() == 7
                    && m.color.starts_with('#')
                    && m.color[1..].bytes().all(|c| c.is_ascii_hexdigit()),
                "Use a hex drawing color"
            );
            ensure!(
                m.width.is_finite() && (1.0..=12.0).contains(&m.width),
                "Invalid pen width"
            );
            ensure!(
                (1..=4096).contains(&m.points.len()),
                "Invalid stroke length"
            );
            ensure!(
                m.tool != "highlight" || m.points.len() == 2,
                "Highlight requires two corners"
            );
            for p in &m.points {
                for n in p {
                    ensure!(
                        n.is_finite()
                            && if self.space == "normalized" {
                                (0.0..=1000.0).contains(n)
                            } else {
                                n.abs() <= 1_000_000.0
                            },
                        "Invalid drawing point"
                    );
                }
            }
            points += m.points.len();
        }
        ensure!(points <= 40_000, "Drawing has too many points");
        ensure!(
            serde_json::to_vec(self)?.len() <= 1_500_000,
            "Drawing exceeds 1.5 MB"
        );
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn board() -> AnnotationBoard {
        AnnotationBoard {
            id: "b".into(),
            schema_version: 1,
            owner_kind: "network".into(),
            owner_id: "n".into(),
            view_key: "canvas".into(),
            space: "world".into(),
            marks: vec![Mark {
                id: "m".into(),
                tool: "pen".into(),
                color: "#a3c9ae".into(),
                width: 3.0,
                points: vec![[1.0, 2.0], [3.0, 4.0]],
            }],
        }
    }
    #[test]
    fn marks_are_bounded_and_typed() {
        let mut b = board();
        assert!(b.validate().is_ok());
        b.marks[0].points[0][0] = f64::NAN;
        assert!(b.validate().is_err());
        b = board();
        b.marks[0].color = "url(script)".into();
        assert!(b.validate().is_err());
        b = board();
        b.marks.push(b.marks[0].clone());
        assert!(b.validate().is_err());
        b = board();
        b.owner_kind = "calendar".into();
        assert!(b.validate().is_err());
        b.space = "normalized".into();
        b.view_key = "Month:2026-11-01".into();
        assert!(b.validate().is_ok());
        b.marks[0].points[0][0] = 1001.0;
        assert!(b.validate().is_err());
    }
}
