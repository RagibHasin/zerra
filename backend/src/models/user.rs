use axum_login::{AuthUser, AuthnBackend, UserId};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, prelude::*};
use tokio::task;

#[derive(Clone, Serialize, Deserialize, FromRow)]
pub(crate) struct User {
    pub(crate) id: i64,
    pub(crate) username: String,
    pub(crate) display_name: String,
    pub(crate) is_male: bool,
    auth_hash: String,
}

impl std::fmt::Debug for User {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("User")
            .field("id", &self.id)
            .field("username", &self.username)
            .field("display_name", &self.display_name)
            .field("is_male", &self.is_male)
            .finish_non_exhaustive()
    }
}

impl AuthUser for User {
    type Id = i64;

    fn id(&self) -> Self::Id {
        self.id
    }

    fn session_auth_hash(&self) -> &[u8] {
        self.auth_hash.as_bytes()
    }
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct Credentials {
    pub(crate) username: String,
    pub(crate) password: String,
    pub(crate) next: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct AuthBackend {
    db: PgPool,
}

impl AuthBackend {
    pub(crate) fn new(db: PgPool) -> Self {
        Self { db }
    }
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum Error {
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),

    #[error(transparent)]
    TaskJoin(#[from] task::JoinError),
}

impl AuthnBackend for AuthBackend {
    type User = User;
    type Credentials = Credentials;
    type Error = Error;

    async fn authenticate(
        &self,
        creds: Self::Credentials,
    ) -> Result<Option<Self::User>, Self::Error> {
        let user: Option<Self::User> = sqlx::query_as("select * from users where username = $1")
            .bind(creds.username)
            .fetch_optional(&self.db)
            .await?;

        Ok(task::spawn_blocking(|| {
            user.filter(|user| {
                password_auth::verify_password(creds.password, &user.auth_hash)
                    .inspect_err(|e| tracing::error!(?e, "password verification failed"))
                    .is_ok()
            })
        })
        .await?)
    }

    async fn get_user(&self, user_id: &UserId<Self>) -> Result<Option<Self::User>, Self::Error> {
        let user = sqlx::query_as("select * from users where id = $1")
            .bind(user_id)
            .fetch_optional(&self.db)
            .await?;

        Ok(user)
    }
}

pub(crate) type AuthSession = axum_login::AuthSession<AuthBackend>;
