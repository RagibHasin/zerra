use axum::{
    Json, Router,
    extract::{Path, State, WebSocketUpgrade},
    response::IntoResponse,
    routing::{get, post},
};
use axum_extra::extract::CookieJar;
use types::zerra::Progress;

use crate::models::{
    Result, authenticated,
    conduction::{Attendee, Conductor, Participant},
    error::Error,
    transcription::transcribe,
    unauthenticated,
    user::AuthSession,
};
use crate::{
    env::{AppState, i18n},
    utils::after_a_month,
};

pub(crate) fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_zerrae))
        .route("/new", get(new_zerra))
        .route("/copy/{id}", get(copy_zerra))
        .route("/export/{id}", get(export_zerra))
        .route("/import", post(import_zerra))
        .route("/delete/{id}", get(delete_zerra))
        .route("/edit/{id}", get(edit_zerra))
        .route("/conduct/{id}", get(conduct_zerra))
        .route("/attend/{id}", get(attend_zerra))
        .route("/transcript/{id}", get(transcribe_zerra))
}

async fn list_zerrae(
    auth_session: AuthSession,
    State(AppState { db, .. }): State<AppState>,
) -> Result<impl IntoResponse> {
    authenticated::Context::authenticate(auth_session.user, &db)?
        .1
        .fetch_zerrae()
        .await
        .map(Json)
}

async fn new_zerra(
    auth_session: AuthSession,
    State(AppState { db, .. }): State<AppState>,
) -> Result<impl IntoResponse> {
    authenticated::Context::authenticate(auth_session.user, &db)?
        .1
        .new_zerra()
        .await
}

async fn copy_zerra(
    auth_session: AuthSession,
    Path(zerra_id): Path<String>,
    State(AppState { db, .. }): State<AppState>,
) -> Result<impl IntoResponse> {
    authenticated::Context::authenticate(auth_session.user, &db)?
        .1
        .copy(&zerra_id)
        .await
}

async fn export_zerra(
    auth_session: AuthSession,
    Path(zerra_id): Path<String>,
    State(AppState { db, .. }): State<AppState>,
) -> Result<impl IntoResponse> {
    authenticated::Context::authenticate(auth_session.user, &db)?
        .1
        .export(&zerra_id)
        .await
}

async fn import_zerra(
    auth_session: AuthSession,
    State(AppState { db, .. }): State<AppState>,
    yaml: String,
) -> Result<impl IntoResponse> {
    authenticated::Context::authenticate(auth_session.user, &db)?
        .1
        .import(&yaml)
        .await
}

async fn delete_zerra(
    auth_session: AuthSession,
    Path(zerra_id): Path<String>,
    State(AppState { db, .. }): State<AppState>,
) -> Result<impl IntoResponse> {
    authenticated::Context::authenticate(auth_session.user, &db)?
        .1
        .delete(&zerra_id)
        .await
        .map(Json)
}

async fn edit_zerra(
    auth_session: AuthSession,
    Path(zerra_id): Path<String>,
    ws: WebSocketUpgrade,
    State(AppState { db, .. }): State<AppState>,
) -> Result<impl IntoResponse> {
    let (_, ctx) = authenticated::Context::authenticate(auth_session.user, &db)?;
    ctx.owns(&zerra_id).await?;
    let blob = unauthenticated::fetch_blob(&db, &zerra_id).await?;
    Ok(ws.on_upgrade(ctx.edit(zerra_id, blob)))
}

async fn conduct_zerra(
    auth_session: AuthSession,
    Path(zerra_id): Path<String>,
    ws: WebSocketUpgrade,
    State(AppState {
        db,
        under_conduction,
        ..
    }): State<AppState>,
) -> Result<impl IntoResponse> {
    let (_, ctx) = authenticated::Context::authenticate(auth_session.user, &db)?;
    ctx.owns(&zerra_id).await?;
    let blob = unauthenticated::fetch_blob(&db, &zerra_id).await?;
    Ok(ws.on_upgrade(
        Participant::<Conductor>::new(db, zerra_id, under_conduction).participate(blob),
    ))
}

#[derive(serde::Deserialize)]
struct Metadata {
    progress: Progress,
}

async fn attend_zerra(
    jar: CookieJar,
    Path(zerra_id): Path<String>,
    ws: WebSocketUpgrade,
    State(AppState {
        db,
        under_conduction,
        ..
    }): State<AppState>,
) -> Result<impl IntoResponse> {
    let blob = unauthenticated::fetch_blob(&db, &zerra_id).await?;
    let Metadata { progress } = rmp_serde::from_slice(&blob)?;
    let cookie_name = format!("attendee_{zerra_id}");

    match progress {
        Progress::None => Ok((
            jar.add(
                tower_sessions::cookie::Cookie::build((
                    cookie_name.clone(),
                    uuid::Uuid::new_v4().as_simple().to_string(),
                ))
                .path("/")
                .expires(after_a_month()),
            ),
            ws.on_upgrade(
                Participant::<Attendee>::new(db, zerra_id, under_conduction).participate(blob),
            ),
        )),
        Progress::Intro { participant_uuid }
        | Progress::Ongoing {
            participant_uuid, ..
        }
        | Progress::Finished {
            participant_uuid, ..
        } => {
            let cookie_uuid = jar.get(&cookie_name).ok_or_else(|| {
                Error::Unauthorized(format!(
                    "zerra {zerra_id} already attended by {participant_uuid}"
                ))
            })?;
            if cookie_uuid.value_trimmed() == participant_uuid {
                Ok((
                    jar,
                    ws.on_upgrade(
                        Participant::<Attendee>::new(db, zerra_id, under_conduction)
                            .participate(blob),
                    ),
                ))
            } else {
                Err(Error::Unauthorized(format!(
                    "zerra {zerra_id} already attended by {participant_uuid}; {} cannot attend",
                    cookie_uuid.value_trimmed(),
                )))
            }
        }
    }
}

async fn transcribe_zerra(
    jar: CookieJar,
    Path(zerra_id): Path<String>,
    State(AppState { db, .. }): State<AppState>,
) -> Result<impl IntoResponse> {
    let blob = unauthenticated::fetch_blob(&db, &zerra_id).await?;
    let Metadata { progress } = rmp_serde::from_slice(&blob)?;
    let cookie_name = format!("attendee_{zerra_id}");

    match progress {
        Progress::Finished {
            participant_uuid,
            printable,
            ..
        } => {
            let cookie_uuid = jar.get(&cookie_name).ok_or_else(|| {
                Error::Unauthorized(format!(
                    "zerra {zerra_id} attended by {participant_uuid}: nobody else can transcribe"
                ))
            })?;
            if cookie_uuid.value_trimmed() == participant_uuid {
                if printable {
                    transcribe(
                        &db,
                        &zerra_id,
                        i18n(jar.get("lang").map_or("en", |c| c.value_trimmed())),
                    )
                    .await
                } else {
                    Err(Error::Forbidden(format!(
                        "zerra {zerra_id} is not printable"
                    )))
                }
            } else {
                Err(Error::Unauthorized(format!(
                    "zerra {zerra_id} attended by {participant_uuid}: {} cannot transcribe",
                    cookie_uuid.value_trimmed(),
                )))
            }
        }
        _ => Err(Error::NotFound(format!("zerra {zerra_id} is not finished"))),
    }
}
