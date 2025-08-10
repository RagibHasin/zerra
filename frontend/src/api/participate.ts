import * as Y from 'yjs';
import cookie from 'js-cookie';
import { pack, unpack } from 'msgpackr';
import { useCallback, useEffect, useMemo, useReducer, useState, useSyncExternalStore } from 'react';
import useWebSocket from 'react-use-websocket';
import { P, match } from 'ts-pattern';

import { MessageFromAttendee } from '../../../types/bindings/MessageFromAttendee';
import { MessageFromConductor } from '../../../types/bindings/MessageFromConductor';
import { MessageToClient } from '../../../types/bindings/MessageToClient';
import { DocAction, Progress, Zerra, doAction } from '../model';
import { Debouncer } from '../utils/debouncer';
import { bind } from '../utils/immer-yjs/index';

type Status = 'connecting' | 'waiting' | 'connected' | 'disconnected'; // | 'not-found'; // TODO

const docSource = new Y.Doc();
const docBound = bind<Zerra>(docSource.getMap());

function useZerraParticipant<Msg>(
  party: 'conduct' | 'attend',
  uuid: string,
  sendOnPatch: boolean,
  onEdit: (
    shouldSend: boolean,
    sendMessage: (msg: Msg) => void,
    doc: Zerra,
    patch: Uint8Array<ArrayBufferLike> | null,
    pushPatch: React.ActionDispatch<[Uint8Array<ArrayBufferLike> | null]>,
    setShouldSend: React.Dispatch<React.SetStateAction<boolean>>,
  ) => void,
  onProgressToIntro: (
    progress: Progress | undefined,
    dispatchDoc: (action: DocAction) => void,
  ) => void,
) {
  const [patch, pushPatch] = useReducer(
    (existing: Uint8Array | null, incoming: Uint8Array | null) =>
      incoming === null ? null
      : existing === null ? incoming
      : Y.mergeUpdates([existing, incoming]),
    null,
  );
  useEffect(
    () =>
      void docSource.on('update', (patch, origin) =>
        origin !== 'remote' ? pushPatch(patch) : undefined,
      ),
    [],
  );

  const debouncer = useMemo(() => new Debouncer(), []);
  const enqueueDebounced = useCallback(
    (key: string | [number[], string]) => debouncer.debounce(key, () => setShouldSend(true)),
    [debouncer],
  );

  const dispatchDoc = useCallback(
    (action: DocAction) =>
      docBound.update((doc) =>
        doAction(action, doc, (key) =>
          key === undefined ? setShouldSend(true) : enqueueDebounced(key),
        ),
      ),
    [enqueueDebounced],
  );

  const doc = useSyncExternalStore(docBound.subscribe, docBound.get);

  const [status, setStatus] = useState('connecting' as Status);

  const [shouldSend, setShouldSend] = useState(false);

  const onMessage = useCallback(
    (data: Uint8Array<ArrayBuffer>) => {
      const message = unpack(data) as MessageToClient;
      console.log('recvMessage', new Date().toISOString(), message);
      match(message)
        .with({ blob: P.select() }, (blob) =>
          dispatchDoc({ action: 'setDoc', doc: unpack(new Uint8Array(blob)) as Zerra }),
        )
        .with({ presence: P.any }, () => setStatus('connected'))
        .with({ patch: P.select() }, (patch) => {
          Y.applyUpdate(docSource, new Uint8Array(patch), 'remote');
          if (sendOnPatch) setShouldSend(true);
        })
        .exhaustive();
    },
    [dispatchDoc, sendOnPatch],
  );

  const { sendMessage: wsSendMsg } = useWebSocket(`/api/${party}/${uuid}`, {
    disableJson: true,
    heartbeat: { returnMessage: 'pong', interval: 1000, timeout: 60000 },
    reconnectInterval: 1000,
    shouldReconnect: () => true,
    onOpen: () => setStatus('waiting'),
    onClose: () => setStatus('disconnected'),
    async onMessage(e) {
      if (e.data instanceof Blob) onMessage(new Uint8Array(await e.data.arrayBuffer()));
    },
  });
  const sendMessage = useCallback(
    (msg: Msg) => {
      console.log('sendMessage', new Date().toISOString(), msg);
      wsSendMsg(pack(msg));
    },
    [wsSendMsg],
  );

  useEffect(
    () => onEdit(shouldSend, sendMessage, doc, patch, pushPatch, setShouldSend),
    [doc, onEdit, patch, sendMessage, shouldSend],
  );

  useEffect(
    () => onProgressToIntro(doc.progress, dispatchDoc),
    [dispatchDoc, doc, onProgressToIntro],
  );

  return {
    get doc() {
      return Object.keys(doc).length === 0 ? null : doc;
    },
    dispatchDoc,
    status,
  };
}

export function useZerraConductor(uuid: string) {
  return useZerraParticipant<MessageFromConductor>(
    'conduct',
    uuid,
    true,
    useCallback((shouldSend, sendMessage, doc, patch, pushPatch, setShouldSend) => {
      if (shouldSend) {
        sendMessage({ blob: pack(doc), patch });
        pushPatch(null);
        setShouldSend(false);
      }
    }, []),
    useCallback(() => {}, []),
  );
}

export function useZerraAttendee(uuid: string) {
  return useZerraParticipant<MessageFromAttendee>(
    'attend',
    uuid,
    false,
    useCallback((shouldSend, sendMessage, _, patch, pushPatch, setShouldSend) => {
      if (shouldSend && patch !== null) {
        sendMessage({ patch });
        pushPatch(null);
        setShouldSend(false);
      }
    }, []),
    useCallback(
      (progress, dispatchDoc) => {
        if (progress?.status === 'none') {
          const userUUID = cookie.get(`attendee_${uuid}`);
          if (userUUID === undefined) throw Error('Attendee UUID has not been set by server');
          dispatchDoc({ action: 'declareAttendee', uuid: userUUID });
        }
      },
      [uuid],
    ),
  );
}
