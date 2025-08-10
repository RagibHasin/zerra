import * as icons from '@heroicons/react/24/outline';
import { MDXEditor, MDXEditorMethods, headingsPlugin, listsPlugin } from '@mdxeditor/editor';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { P, match } from 'ts-pattern';

import {
  Query,
  QueryAction,
  QueryStatus,
  Zerra,
  displayOf,
  idOf,
  isLastQueryInFlow,
  nextVisible,
} from '../model';

type Props = {
  query: Query;
  path: number[];
  readonly doc: Zerra;
  dispatchDoc: (action: QueryAction) => void;
};

export default function QueryCard({ query, path, doc, dispatchDoc }: Props) {
  const { t } = useTranslation();

  const { key, question, revelation, answer, comment, subflow, skippable, visible } = query;
  const [oldAnswer, setOldAnswer] = useState(answer ?? '');
  const refAnswer = useRef<MDXEditorMethods>(null);

  useEffect(() => {
    if (answer !== oldAnswer) setOldAnswer(answer ?? '');
    refAnswer?.current?.setMarkdown(oldAnswer);
  }, [oldAnswer, answer]);

  const isSubPath = (next: number[]): boolean =>
    next.length === path.length && next.every((f, i) => f === path[i]);
  const ongoing =
    doc.progress.status === 'ongoing' &&
    (doc.progress.query_status === QueryStatus.AttendeeReviewing ?
      match(nextVisible(doc.flow, doc.progress.view))
        .with(P.nullish, () => false)
        .otherwise(isSubPath)
    : isSubPath(doc.progress.view));

  return (
    <div id={idOf(path)}>
      <div className="join ps-4 *:rounded-b-none">
        <button
          className="btn join-item btn-square btn-xs"
          disabled={path[path.length - 1] == 0}
          onClick={() => dispatchDoc({ action: 'moveUp', path })}
        >
          <icons.ArrowUpIcon className="size-4" />
        </button>
        <button
          className="btn join-item btn-square btn-xs"
          disabled={isLastQueryInFlow(doc.flow, path)}
          onClick={() => dispatchDoc({ action: 'moveDown', path })}
        >
          <icons.ArrowDownIcon className="size-4" />
        </button>
        <button
          className="btn join-item btn-square btn-xs btn-info"
          onClick={() => dispatchDoc({ action: 'insert', path })}
        >
          <icons.PlusIcon className="size-4" />
        </button>
        <button
          className="btn join-item btn-square btn-xs btn-error"
          onClick={() => dispatchDoc({ action: 'remove', path })}
        >
          <icons.XMarkIcon className="size-4" />
        </button>
      </div>

      <div className="join ps-4 *:rounded-b-none">
        <button
          className="btn join-item btn-square btn-xs"
          onClick={() => dispatchDoc({ action: 'toggleSkippable', path })}
        >
          {skippable ?
            <icons.ForwardIcon className="size-4" />
          : <icons.PlayIcon className="size-4" />}
        </button>
        <button
          className="btn join-item btn-square btn-xs"
          onClick={() => dispatchDoc({ action: 'toggleVisible', path })}
        >
          {visible ?
            <icons.EyeIcon className="size-4" />
          : <icons.EyeSlashIcon className="size-4" />}
        </button>
        {doc.progress.status !== 'ongoing' ? null : (
          <button
            className="btn join-item btn-square btn-xs"
            onClick={() => dispatchDoc({ action: 'setAsNext', path })}
          >
            <icons.ArrowRightEndOnRectangleIcon className="size-4" />
          </button>
        )}
      </div>

      <div className="join ps-4 text-sm">{displayOf(path, t)}</div>

      <div
        className={
          'flex flex-col gap-4 rounded-box p-4' +
          (ongoing ? ' inset-ring inset-ring-primary' : ' ') +
          (path.length == 1 ? ' bg-base-200'
          : path.length == 2 ? ' bg-base-300'
          : ' border border-primary/30 shadow-md')
        }
      >
        <fieldset className="-mt-2 fieldset">
          <legend className="fieldset-legend">{t('Question')}</legend>
          <MDXEditor
            markdown={question}
            onChange={(e) => dispatchDoc({ action: 'setQuestion', path, question: e })}
            plugins={[headingsPlugin(), listsPlugin()]}
          />
        </fieldset>

        <fieldset className="-mt-2 fieldset">
          <legend className="fieldset-legend">{t('Revelation')}</legend>
          <MDXEditor
            markdown={revelation}
            onChange={(e) => dispatchDoc({ action: 'setRevelation', path, revelation: e })}
            plugins={[headingsPlugin(), listsPlugin()]}
          />
        </fieldset>

        {doc.progress.status === 'none' || doc.progress.status === 'intro' ? null : (
          <>
            <fieldset className="-mt-2 fieldset">
              <legend className="fieldset-legend">{t('Answer')}</legend>
              <MDXEditor
                ref={refAnswer}
                markdown={oldAnswer}
                onChange={(e) => dispatchDoc({ action: 'setAnswer', path, answer: nulle(e) })}
                plugins={[headingsPlugin(), listsPlugin()]}
              />
            </fieldset>

            <fieldset className="-mt-2 fieldset">
              <legend className="fieldset-legend">{t('Comment')}</legend>
              <MDXEditor
                markdown={comment ?? ''}
                onChange={(e) => dispatchDoc({ action: 'setComment', path, comment: nulle(e) })}
                plugins={[headingsPlugin(), listsPlugin()]}
              />
            </fieldset>
          </>
        )}

        {subflow.map((query, index) => (
          <QueryCard
            key={key}
            query={query}
            path={[...path, index]}
            doc={doc}
            dispatchDoc={dispatchDoc}
          />
        ))}

        {path.length > 2 ? null : (
          <button
            className="btn btn-block"
            onClick={() => dispatchDoc({ action: 'insert', path: [...path, subflow.length] })}
          >
            <icons.PlusIcon className="size-5" /> {t('Add query')}
          </button>
        )}
      </div>
    </div>
  );
}

const nulle = (s: string) => (s === '' ? null : s);
