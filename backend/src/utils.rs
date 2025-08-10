use tower_sessions::cookie::time::OffsetDateTime;

pub(crate) trait ResultExt {
    fn traced(self) -> Self;
    fn void(self);
}

impl<T, E: std::error::Error> ResultExt for Result<T, E> {
    #[track_caller]
    fn traced(self) -> Self {
        if let Err(e) = &self {
            tracing::error!(%e);
        }
        self
    }

    fn void(self) {}
}

pub(crate) fn after_a_month() -> OffsetDateTime {
    OffsetDateTime::now_utc() + tower_sessions::cookie::time::Duration::days(30)
}
