import { pack, unpack } from 'msgpackr';
import { useEffect, useRef, useState } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { useImmerReducer } from 'use-immer';

import { DocAction, Zerra, doAction } from '../model';
import { Debouncer } from '../utils/debouncer';

export default function useZerraEditor(uuid: string) {
  const ws = useWebSocket(`/api/edit/${uuid}`, { disableJson: true });

  const [shouldSend, setShouldSend] = useState(false);

  const debouncer = useRef(new Debouncer());
  const enqueueDebounced = (key: string | [number[], string]) =>
    debouncer.current.debounce(key, () => setShouldSend(true));

  const [doc, dispatchDoc] = useImmerReducer(
    (doc, action: DocAction) =>
      doAction(action, doc, (key) =>
        key === undefined ? setShouldSend(true) : enqueueDebounced(key),
      ),
    null as Zerra | null,
  );

  useEffect(() => {
    void (async () => {
      if (ws.lastMessage !== null && doc === null) {
        try {
          dispatchDoc({
            action: 'setDoc',
            doc: unpack(new Uint8Array(await (ws.lastMessage.data as Blob).arrayBuffer())) as Zerra,
          });
        } catch (e) {
          console.error(e, ws.lastMessage);
        }
      }
    })();
  }, [dispatchDoc, doc, ws.lastMessage]);

  useEffect(() => {
    if (shouldSend) {
      ws.sendMessage(pack(doc));
      setShouldSend(false);
    }
  }, [doc, shouldSend, ws]);

  return {
    doc,
    dispatchDoc,
    get state() {
      return (
        ws.readyState < ReadyState.OPEN ? 'connecting'
        : ws.readyState == ReadyState.OPEN ? 'connected'
        : 'disconnected'
      );
    },
  };
}
