use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub use jiff;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ListItem {
    pub id: String,
    pub name: String,
    #[ts(type = "string")]
    pub last_modified: jiff::Timestamp,
}

pub mod zerra;

pub mod tx {
    use serde::{Deserialize, Serialize};
    use ts_rs::TS;

    #[derive(Debug, Serialize, Deserialize, TS)]
    #[serde(rename_all = "camelCase")]
    #[ts(export)]
    pub struct MessageFromConductor {
        #[serde(with = "serde_bytes")]
        #[ts(type = "Uint8Array")]
        pub blob: Vec<u8>,
        #[serde(with = "serde_bytes")]
        #[ts(type = "Uint8Array | null")]
        pub patch: Option<Vec<u8>>,
    }

    #[derive(Debug, Serialize, Deserialize, TS)]
    #[serde(rename_all = "camelCase")]
    #[ts(export)]
    pub enum MessageToClient {
        Presence(u8),
        Blob(
            #[serde(with = "serde_bytes")]
            #[ts(type = "Uint8Array")]
            Vec<u8>,
        ),
        Patch(
            #[serde(with = "serde_bytes")]
            #[ts(type = "Uint8Array")]
            Vec<u8>,
        ),
    }

    #[derive(Debug, Serialize, Deserialize, TS)]
    #[serde(rename_all = "camelCase")]
    #[ts(export)]
    pub struct MessageFromAttendee {
        #[serde(with = "serde_bytes")]
        #[ts(type = "Uint8Array")]
        pub patch: Vec<u8>,
    }
}
