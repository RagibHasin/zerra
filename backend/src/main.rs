pub(crate) mod env;
pub(crate) mod routes;

pub(crate) mod models {
    pub(crate) mod authenticated;
    pub(crate) mod conduction;
    pub(crate) mod error;
    pub(crate) mod transcription;
    pub(crate) mod unauthenticated;
    pub(crate) mod user;

    pub(crate) type Result<T = (), E = error::Error> = std::result::Result<T, E>;
}

pub(crate) mod utils;

// #[tokio::main]
// async fn main() -> anyhow::Result<()> {
//     tracing_subscriber::fmt()
//         .with_max_level(tracing::Level::DEBUG)
//         .init();

//     let (listener, state) = env::AppState::get_or_default().await?;

//     tracing::info!("Listening on {:?}", listener);
//     tracing::info!("Serving files in {}", state.assets_dir.display());

//     axum::serve(listener, routes::router(state).await?).await?;
//     Ok(())
// }

#[shuttle_runtime::main]
async fn main(#[shuttle_shared_db::Postgres] db: sqlx::PgPool) -> shuttle_axum::ShuttleAxum {
    let state = env::AppState::new(db, std::path::PathBuf::from("frontend/dist")).await?;
    Ok(routes::router(state).await?.into())
}
