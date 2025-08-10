use std::{
    marker::PhantomData,
    mem,
    pin::{Pin, pin},
    sync::Arc,
    time::Duration,
};

use axum::extract::ws::{Message, WebSocket};
use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt, stream};
use scopeguard::guard;
use sqlx::PgPool;
use tokio::{spawn, sync::mpsc};
use types::tx::{MessageFromAttendee, MessageFromConductor, MessageToClient};

use crate::{models::unauthenticated::update_blob, utils::ResultExt as _};

#[derive(Debug)]
pub(crate) enum MessageEnRoute {
    Presence,
    Patch(Vec<u8>),
    Kill,
}

impl TryFrom<MessageEnRoute> for Message {
    type Error = rmp_serde::encode::Error;

    fn try_from(msg: MessageEnRoute) -> Result<Self, Self::Error> {
        match msg {
            MessageEnRoute::Presence => {
                rmp_serde::to_vec_named(&MessageToClient::Presence(0)).map(Message::binary)
            }
            MessageEnRoute::Patch(patch) => {
                rmp_serde::to_vec_named(&MessageToClient::Patch(patch)).map(Message::binary)
            }
            MessageEnRoute::Kill => Ok(Message::Close(None)),
        }
    }
}

#[derive(Debug)]
pub(crate) enum ConnectionStatus {
    WaitingForConductor(mpsc::Sender<MessageEnRoute>, mpsc::Receiver<MessageEnRoute>),
    WaitingForAttedee(mpsc::Sender<MessageEnRoute>, mpsc::Receiver<MessageEnRoute>),
    Established,
}

#[derive(Debug)]
pub(crate) struct Conduction {
    pub(crate) status: ConnectionStatus,
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum MsgError {
    #[error("server-side channel error: {0}")]
    Channel(#[from] mpsc::error::SendError<MessageEnRoute>),
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),
}

pub(crate) trait Party: Sized + Send + Sync {
    const NAME: &str;
    type Message: Send + for<'a> serde::Deserialize<'a>;

    fn init(
        entry: dashmap::Entry<'_, String, Conduction>,
    ) -> (mpsc::Sender<MessageEnRoute>, mpsc::Receiver<MessageEnRoute>);
    fn on_message(
        participant: &Participant<Self>,
        msg: Self::Message,
    ) -> impl Future<Output = Result<(), MsgError>> + Send;
}

#[derive(Debug)]
pub(crate) struct Conductor;

#[derive(Debug)]
pub(crate) struct Attendee;

impl Party for Conductor {
    const NAME: &str = "conductor";
    type Message = MessageFromConductor;

    fn init(
        entry: dashmap::Entry<'_, String, Conduction>,
    ) -> (mpsc::Sender<MessageEnRoute>, mpsc::Receiver<MessageEnRoute>) {
        match entry {
            dashmap::Entry::Occupied(mut existing) => {
                let ConnectionStatus::WaitingForConductor(tx_sig, rx_sig) = mem::replace(
                    &mut existing.get_mut().status,
                    ConnectionStatus::Established,
                ) else {
                    panic!(
                        "invalid status on occupied conduction entry in conductor: must be waiting for conductor"
                    );
                };
                (tx_sig, rx_sig)
            }
            dashmap::Entry::Vacant(new) => {
                let (tx_sig_attendee, rx_sig) = mpsc::channel(16);
                let (tx_sig, rx_sig_attendee) = mpsc::channel(16);
                new.insert(Conduction {
                    status: ConnectionStatus::WaitingForAttedee(tx_sig_attendee, rx_sig_attendee),
                });
                (tx_sig, rx_sig)
            }
        }
    }

    async fn on_message(
        participant: &Participant<Self>,
        msg: Self::Message,
    ) -> Result<(), MsgError> {
        update_blob(&participant.db, &participant.zerra_id, &msg.blob).await?;
        if let Some(patch) = msg.patch {
            participant
                .tx_sig
                .send(MessageEnRoute::Patch(patch))
                .await?
        }
        Ok(())
    }
}

impl Party for Attendee {
    const NAME: &str = "attendee";
    type Message = MessageFromAttendee;

    fn init(
        entry: dashmap::Entry<'_, String, Conduction>,
    ) -> (mpsc::Sender<MessageEnRoute>, mpsc::Receiver<MessageEnRoute>) {
        match entry {
            dashmap::Entry::Occupied(mut existing) => {
                let ConnectionStatus::WaitingForAttedee(tx_sig, rx_sig) = mem::replace(
                    &mut existing.get_mut().status,
                    ConnectionStatus::Established,
                ) else {
                    panic!(
                        "invalid status on occupied conduction entry in attendee: must be waiting for attendee"
                    );
                };
                (tx_sig, rx_sig)
            }
            dashmap::Entry::Vacant(new) => {
                let (tx_sig_conductor, rx_sig) = mpsc::channel(16);
                let (tx_sig, rx_sig_conductor) = mpsc::channel(16);
                new.insert(Conduction {
                    status: ConnectionStatus::WaitingForConductor(
                        tx_sig_conductor,
                        rx_sig_conductor,
                    ),
                });
                (tx_sig, rx_sig)
            }
        }
    }

    async fn on_message(
        participant: &Participant<Self>,
        msg: Self::Message,
    ) -> Result<(), MsgError> {
        participant
            .tx_sig
            .send(MessageEnRoute::Patch(msg.patch))
            .await?;
        Ok(())
    }
}

#[derive(Debug)]
pub(crate) struct Participant<P> {
    db: PgPool,
    zerra_id: String,
    tx_sig: mpsc::Sender<MessageEnRoute>,
    rx_sig: Option<mpsc::Receiver<MessageEnRoute>>,
    under_conduction: Arc<DashMap<String, Conduction>>,
    _party: PhantomData<P>,
}

impl<P: Party + 'static> Participant<P> {
    pub(crate) fn new(
        db: PgPool,
        zerra_id: String,
        under_conduction: Arc<DashMap<String, Conduction>>,
    ) -> Self {
        let (tx_sig, rx_sig) = P::init(under_conduction.entry(zerra_id.clone()));
        Participant {
            db,
            zerra_id,
            tx_sig,
            rx_sig: Some(rx_sig),
            under_conduction,
            _party: PhantomData,
        }
    }

    pub(crate) fn participate(
        mut self,
        blob: Vec<u8>,
    ) -> impl FnOnce(WebSocket) -> Pin<Box<dyn Future<Output = ()> + Send + 'static>> + Send + 'static
    {
        move |ws| {
            Box::pin(async move {
                let tx_sig = self.tx_sig.clone();
                let tx_sig = guard(tx_sig, |tx_sig| {
                    spawn(async move { tx_sig.send(MessageEnRoute::Kill).await.traced().void() });
                });
                let (tx_ws, rx_ws) = ws.split();
                let zerra_id = self.zerra_id.clone();
                let under_conduction = self.under_conduction.clone();
                let mut tx_ws_sink = guard(tx_ws, move |mut writer| {
                    spawn(async move {
                        writer.close().await.traced().void();
                    });
                    under_conduction.remove(&zerra_id);
                });
                let mut rx_ws = pin!(tokio_stream::StreamExt::timeout(
                    rx_ws,
                    Duration::from_secs(5)
                ));

                let (tx_ws, mut ts_ws_pump) = mpsc::channel::<Message>(16);
                let mut ts_ws_pump = stream::poll_fn(move |cx| ts_ws_pump.poll_recv(cx)).map(Ok);
                spawn(async move { tx_ws_sink.send_all(&mut ts_ws_pump).await });

                if let Err(e) = async {
                    let blob_len = blob.len();
                    let message = rmp_serde::to_vec_named(&MessageToClient::Blob(blob))?;
                    tx_ws.send(Message::binary(message)).await?;
                    tracing::debug!("Sent {blob_len} bytes");

                    tx_sig.send(MessageEnRoute::Presence).await?;
                    tracing::debug!("Sent presence of {}", P::NAME);
                    Ok::<_, anyhow::Error>(())
                }
                .await
                {
                    tracing::error!(%e);
                }

                let tx_ws_sig = tx_ws.clone();
                let mut rx_sig = self.rx_sig.take().expect("participant to have `rx_sig`");
                spawn(async move {
                    while let Some(msg) = rx_sig.recv().await {
                        tx_ws_sig
                            .send(Message::try_from(msg).traced().ok()?)
                            .await
                            .traced()
                            .ok()?;
                    }
                    Some(())
                });

                while let Some(msg) = rx_ws.next().await {
                    match msg {
                        Ok(Ok(Message::Binary(blob))) => match rmp_serde::from_slice(&blob) {
                            Ok(msg) => {
                                if P::on_message(&self, msg).await.traced().is_err() {
                                    break;
                                }
                            }
                            Err(e) => tracing::error!(%e),
                        },
                        Ok(Ok(Message::Close(_))) => {
                            tracing::debug!("closing {} upon request", P::NAME);
                            break;
                        }
                        Ok(Ok(Message::Text(p))) if p == "ping" => {
                            if tx_ws.send(Message::text("pong")).await.traced().is_err() {
                                break;
                            }
                        }
                        Ok(Ok(msg)) => {
                            tracing::warn!(?msg, "unexpexted message from {}", P::NAME)
                        }
                        Ok(Err(e)) => {
                            tracing::error!(%e, "closing {}", P::NAME);
                            break;
                        }
                        Err(_) => {
                            tracing::error!("missed {} heartbeat", P::NAME);
                            break;
                        }
                    }
                }
            })
        }
    }
}
