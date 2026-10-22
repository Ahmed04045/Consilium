use anyhow::{ensure, Result};
use consilium_domain::next::DocumentBlock;
use std::sync::Arc;
use wordcraft_doc::{para_block, Block, Cell, Document, Paragraph, Table};
/// The model supplies simple blocks; only this adapter constructs editor internals.
pub fn build(blocks: &[DocumentBlock]) -> Result<(String, String)> {
    ensure!(blocks.len() <= 500, "At most 500 document blocks");
    let mut doc = Document::new();
    doc.body.clear();
    let mut text = vec![];
    for block in blocks {
        match block {
            DocumentBlock::Heading { level, text: t } => {
                ensure!((1..=6).contains(level), "Heading level must be 1–6");
                doc.body.push(para_block(
                    Paragraph::with_text(t, Default::default()).styled(&format!("Heading{level}")),
                ));
                text.push(t.clone());
            }
            DocumentBlock::Paragraph { text: t } => {
                doc.body
                    .push(para_block(Paragraph::with_text(t, Default::default())));
                text.push(t.clone());
            }
            DocumentBlock::List { items, ordered } => {
                ensure!(items.len() <= 500, "List is too long");
                for (i, t) in items.iter().enumerate() {
                    let line = format!(
                        "{} {t}",
                        if *ordered {
                            format!("{}.", i + 1)
                        } else {
                            "•".into()
                        }
                    );
                    doc.body
                        .push(para_block(Paragraph::with_text(&line, Default::default())));
                    text.push(line);
                }
            }
            DocumentBlock::Table { rows } => {
                ensure!(
                    !rows.is_empty() && rows.len() <= 200,
                    "Table needs 1–200 rows"
                );
                let cols = rows.iter().map(Vec::len).max().unwrap_or(0);
                ensure!((1..=20).contains(&cols), "Table needs 1–20 columns");
                let mut table = Table::new(rows.len(), cols, 450.0);
                for (i, row) in rows.iter().enumerate() {
                    for (j, t) in row.iter().enumerate() {
                        table.rows[i].cells[j] = Cell::with_text(t);
                    }
                    text.push(row.join("\t"));
                }
                doc.body.push(Arc::new(Block::Table(table)));
            }
        }
    }
    doc.ensure_nonempty();
    let text = text.join("\n");
    ensure!(text.len() <= 1_000_000, "Document text exceeds 1 MB");
    Ok((serde_json::to_string(&doc)?, text))
}
