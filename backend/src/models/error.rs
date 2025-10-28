use axum::http::StatusCode;

#[derive(Debug, thiserror::Error)]
pub(crate) enum Error {
    #[error("unauthorized access: {0}")]
    Unauthorized(String),
    #[error("forbidden access: {0}")]
    Forbidden(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("database error: {0}")]
    Db(sqlx::Error),
    #[error("blob encode error: {0}")]
    Encode(#[from] rmp_serde::encode::Error),
    #[error("blob decode error: {0}")]
    Decode(#[from] rmp_serde::decode::Error),
    #[error("typst compilation error: {0}")]
    Typst(#[from] tokape::CompilationError),
    #[error("yaml decode error: {0}")]
    YamlDecode(#[from] serde::de::value::Error),
    #[error("yaml encode error: {0}")]
    YamlEncode(#[from] serde_yaml2::ser::Errors),
}

impl axum::response::IntoResponse for Error {
    fn into_response(self) -> axum::response::Response {
        tracing::error!(%self);
        match self {
            Self::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            Self::Forbidden(_) => StatusCode::FORBIDDEN,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        }
        .into_response()
    }
}

impl From<sqlx::Error> for Error {
    fn from(e: sqlx::Error) -> Self {
        match e {
            sqlx::Error::RowNotFound => Error::NotFound("record".into()),
            sqlx::Error::ColumnNotFound(e) => Error::NotFound(e),
            e => Error::Db(e),
        }
    }
}
