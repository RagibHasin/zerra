use std::time::Duration as StdDuration;

use axum::{
    Router,
    extract::Request,
    middleware,
    routing::{any, get_service},
};
use axum_extra::extract::CookieJar;
use axum_login::AuthManagerLayerBuilder;
use tower_http::{compression::CompressionLayer, timeout::TimeoutLayer, trace::TraceLayer};
use tower_sessions::{
    Expiry, SessionManagerLayer,
    cookie::{Cookie, Key, time},
};
use tower_sessions_moka_store::MokaStore;

use crate::{env, models::user::AuthBackend, utils::after_a_month};

pub(crate) mod api;
pub(crate) mod auth;

pub(crate) async fn router(state: env::AppState) -> anyhow::Result<Router> {
    let session_layer = SessionManagerLayer::new(MokaStore::new(Some(1024)))
        .with_secure(false)
        .with_expiry(Expiry::OnInactivity(time::Duration::days(1)))
        .with_signed(Key::generate());

    let serve_index = state.serve_index();
    let serve_assets = state.serve_assets();
    let db = state.db.clone();
    Ok(Router::new()
        .fallback_service(auth::guard(serve_index.clone()))
        .nest("/api", api::routes().with_state(state))
        .route("/logout", any(auth::logout))
        .route("/login", auth::login(serve_index.clone()))
        .route("/attend/{id}", get_service(serve_index))
        .route("/assets/{*any}", get_service(serve_assets))
        .layer(middleware::from_fn(lang_tagger))
        .layer(AuthManagerLayerBuilder::new(AuthBackend::new(db), session_layer).build())
        .layer(CompressionLayer::new().gzip(true))
        .layer(TimeoutLayer::new(StdDuration::from_secs(30)))
        .layer(TraceLayer::new_for_http()))
}

async fn lang_tagger(
    mut jar: CookieJar,
    req: Request,
    next: middleware::Next,
) -> impl axum::response::IntoResponse {
    if jar.get("lang").is_none() {
        jar = jar.add(
            Cookie::build(("lang", "en"))
                .path("/")
                .expires(after_a_month()),
        );
    }
    (jar, next.run(req).await)
}
