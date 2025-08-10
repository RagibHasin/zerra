use axum::{
    Form,
    extract::Request,
    http::StatusCode,
    response::{IntoResponse, Redirect},
    routing::{MethodRouter, any, get},
};
use axum_extra::extract::CookieJar;
use tower::ServiceExt;
use tower_http::services::ServeFile;

use crate::models::user::{AuthSession, Credentials};

pub(crate) fn guard(index: ServeFile) -> MethodRouter {
    any(|auth_session: AuthSession, req: Request| async move {
        if auth_session.user.is_some() {
            index.oneshot(req).await.into_response()
        } else {
            Redirect::to("/login").into_response()
        }
    })
}

pub(crate) fn login(index: ServeFile) -> MethodRouter {
    get(|auth_session: AuthSession, req: Request| async move {
        if auth_session.user.is_some() {
            Redirect::to("/").into_response()
        } else {
            index.oneshot(req).await.into_response()
        }
    })
    .post(login_post)
}

async fn login_post(
    mut auth_session: AuthSession,
    jar: CookieJar,
    Form(creds): Form<Credentials>,
) -> impl IntoResponse {
    let user = match auth_session.authenticate(creds.clone()).await {
        Ok(Some(user)) => user,
        Ok(None) => {
            tracing::error!("invalid credentials");

            let login_url = if let Some(next) = creds.next {
                format!("/login?next={next}")
            } else {
                "/login".to_string()
            };

            return Ok((jar, Redirect::to(&login_url)));
        }
        Err(e) => {
            tracing::error!(?e, "error in auth backend");
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    if let Err(e) = auth_session.login(&user).await {
        tracing::error!(?e, "error in login backend");
        Err(StatusCode::INTERNAL_SERVER_ERROR)
    } else {
        Ok((
            jar.add(("username", user.display_name)),
            Redirect::to(creds.next.as_deref().unwrap_or("/")),
        ))
    }
}

pub(crate) async fn logout(mut auth_session: AuthSession, jar: CookieJar) -> impl IntoResponse {
    if let Err(e) = auth_session.logout().await {
        tracing::error!(?e, "error in auth backend");
        StatusCode::INTERNAL_SERVER_ERROR.into_response()
    } else {
        (jar.remove("username"), Redirect::to("/login")).into_response()
    }
}
