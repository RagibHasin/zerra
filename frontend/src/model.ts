import { TFunction } from 'i18next';
import { P, match } from 'ts-pattern';

import { Progress } from '../../types/bindings/Progress';
import { Query } from '../../types/bindings/Query';
import { QueryStatus } from '../../types/bindings/QueryStatus';
import { Zerra } from '../../types/bindings/Zerra';

export * from '../../types/bindings/QueryStatus';
export * from '../../types/bindings/Zerra';
export * from '../../types/bindings/Query';
export * from '../../types/bindings/Progress';

export function idOf(path: number[]) {
  return path.join('_');
}

export function displayOf(path: number[], t: TFunction) {
  return path.map((i) => t('number', { i: i + 1 })).join(' : ');
}

export function withParent(flow: Query[], path: number[]): Query[];
export function withParent(flow: Query[], path: number[], op: (flow: Query[]) => void): void;
export function withParent(flow: Query[], path: number[], op?: (flow: Query[]) => void) {
  if (path.length === 0) throw new Error('query path must not be empty');
  for (const parentIdx of path.slice(0, -1)) flow = flow[parentIdx].subflow;
  return op !== undefined ? op(flow) : flow;
}

export function withQuery(flow: Query[], path: number[]): Query;
export function withQuery(flow: Query[], path: number[], op: (flow: Query) => void): void;
export function withQuery(flow: Query[], path: number[], op?: (flow: Query) => void) {
  const query = withParent(flow, path)[path[path.length - 1]];
  return op !== undefined ? op(query) : query;
}

export function isLastQueryInFlow(flow: Query[], path: number[]) {
  return path[path.length - 1] === (withParent(flow, path)?.length ?? 0) - 1;
}

export type QueryAction = { path: number[] } & (
  | { action: 'insert' }
  | { action: 'remove' }
  | { action: 'moveUp' }
  | { action: 'moveDown' }
  | { action: 'setQuestion'; question: string }
  | { action: 'setRevelation'; revelation: string }
  | { action: 'setAnswer'; answer: string | null }
  | { action: 'setComment'; comment: string | null }
  | { action: 'toggleSkippable' }
  | { action: 'toggleVisible' }
  | { action: 'setAsNext' }
);

export type DocwideAction =
  | { action: 'setDoc'; doc: Zerra }
  | { action: 'setTitle'; title: string }
  | { action: 'declareAttendee'; uuid: string }
  | { action: 'introduceAttendee'; name: string }
  | { action: 'approveQuery' }
  | { action: 'submitAnswer'; answer: string }
  | { action: 'okFromConductor' }
  | { action: 'okFromAttendee' }
  | { action: 'skip' }
  | { action: 'clearProgress' }
  | { action: 'togglePrintable' };

export type DocAction = DocwideAction | QueryAction;

export type Key = string | [number[], string];

export function doAction<Doc extends Zerra | null>(
  action: DocAction,
  doc: Doc,
  enque: (key?: Key) => void,
) {
  return match(action)
    .with({ action: 'setDoc' }, ({ doc }) => doc)

    .with({ action: 'setTitle' }, ({ title }) => {
      doc!.title = title;
      enque('title');
    })
    .with({ action: 'insert' }, ({ path }) => {
      withParent(doc!.flow, path).splice(path[path.length - 1], 0, {
        key: getNewKey(),
        question: '',
        revelation: '',
        answer: null,
        comment: null,
        subflow: [],
        skippable: false,
        visible: true,
      });
      enque();
    })
    .with({ action: 'remove' }, ({ path }) => {
      withParent(doc!.flow, path).splice(path[path.length - 1], 1);
      enque();
    })

    .with({ action: 'moveUp' }, ({ path }) => {
      const parent = withParent(doc!.flow, path);
      const idxInParent = path.length - 1;
      const idx = path[idxInParent];
      [parent[idx - 1], parent[idx]] = [parent[idx], parent[idx - 1]];
      if (
        doc!.progress.status === 'ongoing' &&
        doc!.progress.view.length >= path.length &&
        doc!.progress.view.slice(0, idxInParent).every((f, i) => f === path[i])
      ) {
        if (doc!.progress.view[idxInParent] === idx) doc!.progress.view[idxInParent]--;
        else if (doc!.progress.view[idxInParent] === idx + 1) doc!.progress.view[idxInParent]++;
      }
      enque();
    })
    .with({ action: 'moveDown' }, ({ path }) => {
      const parent = withParent(doc!.flow, path);
      const idxInParent = path.length - 1;
      const idx = path[idxInParent];
      [parent[idx + 1], parent[idx]] = [parent[idx], parent[idx + 1]];
      if (
        doc!.progress.status === 'ongoing' &&
        doc!.progress.view.length >= path.length &&
        doc!.progress.view.slice(0, idxInParent).every((f, i) => f === path[i])
      ) {
        if (doc!.progress.view[idxInParent] === idx) doc!.progress.view[idxInParent]++;
        else if (doc!.progress.view[idxInParent] === idx + 1) doc!.progress.view[idxInParent]--;
      }
      enque();
    })

    .with({ action: 'setQuestion' }, ({ path, question }) => {
      withQuery(doc!.flow, path).question = question;
      enque([path, 'question']);
    })
    .with({ action: 'setRevelation' }, ({ path, revelation }) => {
      withQuery(doc!.flow, path).revelation = revelation;
      enque([path, 'revelation']);
    })
    .with({ action: 'setAnswer' }, ({ path, answer }) => {
      withQuery(doc!.flow, path).answer = answer;
      enque([path, 'answer']);
    })
    .with({ action: 'setComment' }, ({ path, comment }) => {
      withQuery(doc!.flow, path).comment = comment;
      enque([path, 'comment']);
    })

    .with({ action: 'toggleSkippable' }, ({ path }) => {
      const query = withQuery(doc!.flow, path);
      query.skippable = !query.skippable;
      enque();
    })
    .with({ action: 'toggleVisible' }, ({ path }) => {
      const query = withQuery(doc!.flow, path);
      query.visible = !query.visible;
      if (
        doc!.progress.status === 'ongoing' &&
        doc!.progress.query_status === QueryStatus.Deciding &&
        doc!.progress.view.length >= path.length &&
        doc!.progress.view.slice(0, path.length).every((f, i) => f === path[i])
      ) {
        const next = nextVisible(doc!.flow, path);
        if (next !== null) doc!.progress.view = next;
        else doc!.progress = finish(doc!.progress);
      }
      enque();
    })
    .with({ action: 'setAsNext' }, ({ path }) => {
      if (
        doc!.progress.status === 'ongoing' &&
        doc!.progress.query_status === QueryStatus.Deciding
      ) {
        doc!.progress.view = path;
        enque();
      }
    })

    .with({ action: 'declareAttendee' }, ({ uuid }) => {
      if (doc!.progress.status === 'none') {
        doc!.progress = { status: 'intro', participant_uuid: uuid };
        enque();
      }
    })
    .with({ action: 'introduceAttendee' }, ({ name }) => {
      if (doc!.progress.status === 'intro') {
        doc!.progress = {
          status: 'ongoing',
          participant_uuid: doc!.progress.participant_uuid,
          participant_name: name,
          view: match(doc!.flow.entries().find(([, q]) => queryCanBeShown(q)))
            .with(P.nullish, () => [])
            .otherwise(([i]) => [i]),
          query_status: QueryStatus.Deciding,
        };
        enque();
      }
    })
    .with({ action: 'approveQuery' }, () => {
      if (doc!.progress.status === 'ongoing') {
        doc!.progress.query_status = match(doc!.progress.query_status)
          .with(enVal(QueryStatus.Deciding), () => QueryStatus.Answering)
          .with(enVal(QueryStatus.Reviewing), () => QueryStatus.AttendeeReviewing)
          .otherwise((s) => s);
        enque();
      }
    })
    .with({ action: 'submitAnswer' }, ({ answer }) => {
      if (
        doc!.progress.status === 'ongoing' &&
        doc!.progress.query_status === QueryStatus.Answering
      ) {
        withQuery(doc!.flow, doc!.progress.view).answer = answer;
        doc!.progress.query_status = QueryStatus.Reviewing;
        enque();
      }
    })
    .with({ action: 'okFromConductor' }, () => {
      match(doc!.progress).with({ status: 'ongoing' }, (progress) => {
        if (progress.query_status === QueryStatus.Reviewing) {
          progress.query_status = QueryStatus.AttendeeReviewing;
          enque();
        }
      });
    })
    .with({ action: 'okFromAttendee' }, () => {
      match(doc!.progress).with({ status: 'ongoing' }, (progress) => {
        const next = nextVisible(doc!.flow, progress.view);
        if (next === null) doc!.progress = finish(progress);
        else {
          progress.query_status = match(progress.query_status)
            .with(enVal(QueryStatus.Reviewing), () => {
              progress.view = next;
              return QueryStatus.Deciding;
            })
            .with(enVal(QueryStatus.AttendeeReviewing), () => {
              progress.view = next;
              return QueryStatus.Answering;
            })
            .otherwise((s) => s);
        }
        enque();
      });
    })
    .with({ action: 'skip' }, () => {
      if (
        doc!.progress.status === 'ongoing' &&
        doc!.progress.query_status === QueryStatus.Answering
      ) {
        const next = nextVisible(doc!.flow, doc!.progress.view);
        if (withQuery(doc!.flow, doc!.progress.view).skippable && next !== null) {
          doc!.progress.view = next;
          doc!.progress.query_status = QueryStatus.Deciding;
        } else doc!.progress = finish(doc!.progress);
        enque();
      }
    })
    .with({ action: 'clearProgress' }, () => {
      doc!.progress = { status: 'none' };
      enque();
    })
    .with({ action: 'togglePrintable' }, () => {
      match(doc!.progress).with({ status: 'finished' }, (progress) => {
        progress.printable = !progress.printable;
        enque();
      });
    })
    .exhaustive();
}

function getNewKey() {
  return Math.floor(Math.random() * 65536);
}

const queryCanBeShown = (query: Query) => query.visible && query.answer == null;

export function nextVisible(flow: Query[], path: number[]): number[] | null {
  if (path.length === 0) return null;

  for (const [idx, child] of withQuery(flow, path).subflow.entries()) {
    if (queryCanBeShown(child)) return [...path, idx];
  }

  function nextVisibleInSiblings(flow: Query[], path: number[]): number[] | null {
    if (path.length === 0) return null;

    const parentPath = path.slice(0, -1);
    for (const [idx, sibling] of withParent(flow, path)
      .entries()
      .drop(path[path.length - 1] + 1)) {
      if (queryCanBeShown(sibling)) return [...parentPath, idx];
    }

    return nextVisibleInSiblings(flow, parentPath);
  }

  return nextVisibleInSiblings(flow, path);
}

function finish(
  progress: Extract<Progress, { status: 'ongoing' }>,
): Extract<Progress, { status: 'finished' }> {
  return {
    status: 'finished',
    participant_uuid: progress.participant_uuid,
    participant_name: progress.participant_name,
    printable: false,
  };
}

export function enVal<const T>(
  value: T,
): `${Extract<T, number>}` extends `${infer N extends number}` ? N : T {
  return value as `${Extract<T, number>}` extends `${infer N extends number}` ? N : T;
}
