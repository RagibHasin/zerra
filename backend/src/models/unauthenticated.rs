use sqlx::{PgPool, Row};

pub(crate) async fn owner_of(db: &PgPool, id: &str) -> sqlx::Result<crate::models::user::User> {
    sqlx::query_as("select users.* from vus join users on vus.owner = users.id where vus.id = $1")
        .bind(id)
        .fetch_one(db)
        .await
}

pub(crate) async fn fetch_blob(db: &PgPool, zerra_id: &str) -> sqlx::Result<Vec<u8>> {
    sqlx::query("select data from vus where id = $1")
        .bind(zerra_id)
        .fetch_one(db)
        .await
        .map(|r| r.get(0))
}

pub(crate) async fn update_blob(db: &PgPool, zerra_id: &str, blob: &[u8]) -> sqlx::Result<()> {
    sqlx::query("update vus set data = $1, last_modified = $2 where id = $3")
        .bind(blob)
        .bind(types::jiff::Timestamp::now().as_second())
        .bind(zerra_id)
        .execute(db)
        .await?;
    Ok(())
}
