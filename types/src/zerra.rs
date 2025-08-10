use serde::{Deserialize, Serialize};
use serde_repr::*;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", tag = "status")]
#[ts(export)]
pub enum Progress {
    None,
    Intro {
        participant_uuid: String,
    },
    Ongoing {
        participant_uuid: String,
        participant_name: String,
        view: Vec<usize>,
        query_status: QueryStatus,
    },
    Finished {
        participant_uuid: String,
        participant_name: String,
        printable: bool,
    },
}

#[derive(Debug, Clone, Serialize_repr, Deserialize_repr)]
#[repr(u8)]
pub enum QueryStatus {
    Deciding = 0,
    Answering,
    Reviewing,
    AttendeeReviewing,
}

impl TS for QueryStatus {
    type WithoutGenerics = Self;
    type OptionInnerType = Self;

    fn decl() -> String {
        String::from("enum QueryStatus { Deciding = 0, Answering , Reviewing, AttendeeReviewing }")
    }

    fn decl_concrete() -> String {
        Self::decl()
    }

    fn name() -> String {
        String::from("QueryStatus")
    }

    fn inline() -> String {
        panic!("enum cannot be represented inline")
    }

    fn inline_flattened() -> String {
        panic!("enum cannot be represented inline")
    }

    fn output_path() -> Option<std::path::PathBuf> {
        Some(std::path::PathBuf::from("QueryStatus.ts"))
    }
}

#[cfg(test)]
#[test]
fn export_bindings_query_status() {
    <QueryStatus as TS>::export_all().expect("could not export type");
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Zerra {
    pub id: String,
    pub title: String,
    pub progress: Progress,
    pub flow: Vec<Query>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Query {
    pub key: u16,
    pub question: String,
    pub revelation: String,
    pub answer: Option<String>,
    pub comment: Option<String>,
    pub subflow: Vec<Query>,
    pub skippable: bool,
    pub visible: bool,
}
