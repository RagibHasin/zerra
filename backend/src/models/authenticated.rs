use std::pin::Pin;

use axum::extract::ws::{Message, WebSocket};
use axum_extra::response::Attachment;
use futures_util::{SinkExt, StreamExt};
use sqlx::{PgPool, Row};
use types::ListItem;

use crate::models::{Result, error::Error, unauthenticated::update_blob, user::User};

#[derive(Debug, Clone, Copy)]
pub(crate) struct Context<'db> {
    pub(crate) db: &'db PgPool,
    pub(crate) user: i64,
}

impl<'db> Context<'db> {
    pub(crate) fn authenticate(user: Option<User>, db: &'db PgPool) -> Result<(User, Self)> {
        let user = user.ok_or_else(|| Error::Unauthorized("not logged in".into()))?;
        let ctx = Context { db, user: user.id };
        Ok((user, ctx))
    }

    pub(crate) async fn fetch_zerrae(self) -> Result<Vec<ListItem>> {
        Ok(sqlx::query("select * from vus where owner = $1")
            .bind(self.user)
            .try_map(try_from_row)
            .fetch_all(self.db)
            .await?)
    }

    pub(crate) async fn new_zerra(self) -> Result {
        let id = uuid::Uuid::new_v4().hyphenated().to_string();

        let zerra = types::zerra::Zerra {
            id,
            title: "Title".to_string(),
            progress: types::zerra::Progress::None,
            flow: vec![types::zerra::Query {
                key: rand::random(),
                question: String::new(),
                revelation: String::new(),
                answer: None,
                comment: None,
                subflow: Vec::new(),
                skippable: false,
                visible: true,
            }],
        };

        sqlx::query("insert into vus (id, owner, data, last_modified) values ($1, $2, $3, $4)")
            .bind(&zerra.id)
            .bind(self.user)
            .bind(rmp_serde::to_vec_named(&zerra)?)
            .bind(types::jiff::Timestamp::now().as_second())
            .execute(self.db)
            .await?;

        Ok(())
    }

    pub(crate) async fn copy(self, from_id: &str) -> Result {
        let from_blob = sqlx::query("select data from vus where owner = $1 and id = $2")
            .bind(self.user)
            .bind(from_id)
            .fetch_one(self.db)
            .await
            .map(|r| r.get::<Vec<u8>, _>(0))?;

        let new_zerra = types::zerra::Zerra {
            id: uuid::Uuid::new_v4().hyphenated().to_string(),
            ..rmp_serde::from_slice(&from_blob)?
        };

        sqlx::query("insert into vus (id, owner, data, last_modified) values ($1, $2, $3, $4)")
            .bind(&new_zerra.id)
            .bind(self.user)
            .bind(rmp_serde::to_vec_named(&new_zerra)?)
            .bind(types::jiff::Timestamp::now().as_second())
            .execute(self.db)
            .await?;

        Ok(())
    }

    pub(crate) async fn export(self, id: &str) -> Result<Attachment<String>> {
        let blob = sqlx::query("select data from vus where owner = $1 and id = $2")
            .bind(self.user)
            .bind(id)
            .fetch_one(self.db)
            .await
            .map(|r| r.get::<Vec<u8>, _>(0))?;
        let zerra: types::zerra::Zerra = rmp_serde::from_slice(&blob)?;
        let yaml = serde_yaml2::to_string(&zerra)?;
        Ok(Attachment::new(yaml)
            .content_type("application/yaml")
            .filename(format!("{id}.yaml")))
    }

    pub(crate) async fn import(self, yaml: &str) -> Result {
        let zerra = types::zerra::Zerra {
            id: uuid::Uuid::new_v4().hyphenated().to_string(),
            ..serde_yaml2::from_str(yaml)?
        };

        sqlx::query("insert into vus (id, owner, data, last_modified) values ($1, $2, $3, $4)")
            .bind(&zerra.id)
            .bind(self.user)
            .bind(rmp_serde::to_vec_named(&zerra)?)
            .bind(types::jiff::Timestamp::now().as_second())
            .execute(self.db)
            .await?;

        Ok(())
    }

    pub(crate) async fn delete(self, id: &str) -> Result {
        sqlx::query("delete from vus where owner = $1 and id = $2")
            .bind(self.user)
            .bind(id)
            .execute(self.db)
            .await?;
        Ok(())
    }

    pub(crate) fn edit(
        self,
        id: String,
        blob: Vec<u8>,
    ) -> impl FnOnce(WebSocket) -> Pin<Box<dyn Future<Output = ()> + Send + 'static>> + Send + 'static
    {
        let db = self.db.clone();

        move |ws| {
            Box::pin(async move {
                let (mut writer, mut reader) = ws.split();

                let blob_len = blob.len();
                if let Err(e) = writer.send(Message::binary(blob)).await {
                    tracing::error!(%e);
                    if let Err(e) = writer.close().await {
                        tracing::error!(%e);
                    }
                    return;
                }
                tracing::debug!("Sent {blob_len} bytes");

                while let Some(msg) = reader.next().await {
                    match msg {
                        Ok(Message::Binary(blob)) => {
                            if let Err(e) = update_blob(&db, &id, &blob).await {
                                tracing::error!(%e);
                                if let Err(e) = writer.close().await {
                                    tracing::error!(%e);
                                }
                                break;
                            }
                        }
                        Ok(_) => {}
                        Err(e) => {
                            tracing::error!(%e);
                            if let Err(e) = writer.close().await {
                                tracing::error!(%e);
                            }
                            break;
                        }
                    }
                }
            })
        }
    }

    pub(crate) async fn owns(self, zerra_id: &str) -> Result {
        sqlx::query("select count(1) from vus where owner = $1 and id = $2")
            .bind(self.user)
            .bind(zerra_id)
            .fetch_one(self.db)
            .await
            .map(|r| r.get::<i64, _>(0) != 0)?
            .then_some(())
            .ok_or_else(|| {
                Error::Unauthorized(format!("user({}) does not own zerra {zerra_id}", self.user))
            })
    }
}

fn try_from_row(row: sqlx::postgres::PgRow) -> sqlx::Result<ListItem> {
    let id: String = row.try_get("id")?;
    let blob: Vec<u8> = row.try_get("data")?;
    let last_modified: i64 = row.try_get("last_modified")?;

    #[derive(serde::Deserialize)]
    struct Metadata {
        title: String,
    }
    let metadata: Metadata =
        rmp_serde::from_read(blob.as_slice()).map_err(|e| sqlx::Error::Decode(Box::new(e)))?;

    Ok(ListItem {
        id,
        name: metadata.title,
        last_modified: types::jiff::Timestamp::from_second(last_modified)
            .map_err(|e| sqlx::Error::Decode(Box::new(e)))?,
    })
}

#[test]
fn make_demo() {
    let id = "7544143b-2ee3-486f-a29c-7870f5ba405c";
    let z = types::zerra::Zerra {
        id: id.to_string(),
        title: "আলোচনা".to_string(),
        progress: types::zerra::Progress::None,
        flow: vec![types::zerra::Query {
            key: 9875,
            question: "Nom che??".to_string(),
            revelation: "Ragib".to_string(),
            answer: None,
            comment: None,
            subflow: Vec::new(),
            skippable: false,
            visible: true,
        }],
    };
    std::fs::write(id, rmp_serde::to_vec_named(&z).unwrap()).unwrap()
}
