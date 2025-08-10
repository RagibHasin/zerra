use std::path::PathBuf;
use std::sync::Arc;

use dashmap::DashMap;
use sqlx::PgPool;
use tower_http::services::{ServeDir, ServeFile};

use crate::models::conduction::Conduction;

#[derive(Debug, Clone)]
pub(crate) struct AppState {
    pub(crate) db: PgPool,
    pub(crate) assets_dir: Arc<PathBuf>,
    pub(crate) under_conduction: Arc<DashMap<String, Conduction>>,
}

impl AppState {
    pub(crate) async fn new(db: sqlx::PgPool, assets_dir: PathBuf) -> anyhow::Result<Self> {
        sqlx::migrate!().run(&db).await?;
        Ok(AppState {
            db,
            assets_dir: Arc::new(assets_dir),
            under_conduction: Arc::new(DashMap::new()),
        })
    }

    pub(crate) fn serve_index(&self) -> ServeFile {
        ServeFile::new(self.assets_dir.join("index.html"))
            .precompressed_br()
            .precompressed_gzip()
    }

    pub(crate) fn serve_assets(&self) -> ServeDir {
        ServeDir::new(&*self.assets_dir)
            .precompressed_br()
            .precompressed_gzip()
    }
}

#[derive(Debug, Clone)]
pub(crate) struct I18n {
    pub(crate) index_format: &'static str,
    pub(crate) page_number_format: &'static str,
}

pub(crate) const I18N: &[(&str, I18n)] = &[
    (
        "en",
        I18n {
            index_format: "1.",
            page_number_format: "1",
        },
    ),
    (
        "bn",
        I18n {
            index_format: "১.১)",
            page_number_format: "১",
        },
    ),
];

pub(crate) fn i18n(lang: &str) -> &'static I18n {
    I18N.iter()
        .find_map(|(code, i18n)| (*code == lang).then_some(i18n))
        .unwrap_or(&I18N[0].1)
}
