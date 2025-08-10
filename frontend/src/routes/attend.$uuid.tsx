import { MDXEditor, MDXEditorMethods, headingsPlugin, listsPlugin } from '@mdxeditor/editor';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import { P, match } from 'ts-pattern';

import { useZerraAttendee } from '../api/participate';

import Message from '../fragments/Message';
import Navbar from '../fragments/Navbar';
import Reload from '../fragments/Reload';
import WithSpinner from '../fragments/WithSpinner';

import { DocAction, QueryStatus, enVal, withQuery } from '../model';

export const Route = createFileRoute('/attend/$uuid')({ component: Attend });

function Attend() {
  const { t } = useTranslation();

  const { uuid } = Route.useParams();
  const zerra = useZerraAttendee(uuid);

  const [editField, setEditField] = useState('');

  const dispatchEdit = useCallback(
    (action: DocAction) => {
      zerra.dispatchDoc(action);
      setEditField('');
    },
    [zerra],
  );

  const message = match(zerra.status)
    .with('connecting', () => <WithSpinner>{t('Connecting')}</WithSpinner>)
    .with('waiting', () => <WithSpinner>{t('Waiting for conductor')}</WithSpinner>)
    .with('connected', () => null)
    .with('disconnected', () => <Reload>{t('Connection lost')}</Reload>)
    .exhaustive();

  const answerRef = useRef<MDXEditorMethods>(null);
  const abortModal = useRef<HTMLDialogElement>(null);
  const content = match(zerra.doc)
    .with(P.nonNullable, (doc) =>
      match(doc.progress)
        .with({ status: 'none' }, () => (
          <Message>
            <WithSpinner>Loading...</WithSpinner>
          </Message>
        ))
        .with({ status: 'intro' }, () => (
          <form className="m-4 fieldset w-full sm:w-80">
            <div className="text-xl font-light">{t('Introduction')}</div>
            <input
              type="text"
              className="input w-full"
              placeholder={t('Name')}
              onChange={(e) => setEditField(e.target.value)}
            />
            <button
              className="btn btn-primary"
              disabled={editField.trim().length === 0}
              onClick={() => dispatchEdit({ action: 'introduceAttendee', name: editField })}
            >
              {t('Begin')}
            </button>
          </form>
        ))
        .with({ status: 'ongoing' }, (progress) =>
          match(progress.query_status)
            .with(enVal(QueryStatus.Deciding), () => (
              <Message>
                <WithSpinner>{t('Waiting for next question')}</WithSpinner>
              </Message>
            ))
            .with(enVal(QueryStatus.Answering), () => {
              const query = withQuery(doc.flow, progress.view);
              return (
                <>
                  <div className="flex-1 content-center text-2xl font-light">
                    <Markdown>{query.question}</Markdown>
                  </div>
                  <MDXEditor
                    ref={answerRef}
                    markdown={query.answer ?? ''}
                    plugins={[headingsPlugin(), listsPlugin()]}
                    className="flex-1 content-center !text-2xl font-light"
                  />
                  <div className="flex w-full gap-4">
                    <button
                      className="btn flex-1 btn-secondary"
                      onClick={() =>
                        query.skippable ?
                          dispatchEdit({ action: 'skip' })
                        : abortModal.current?.showModal()
                      }
                    >
                      {t(query.skippable ? 'Skip' : 'Abort')}
                    </button>
                    <button
                      className="btn flex-1 btn-primary"
                      onClick={() =>
                        dispatchEdit({
                          action: 'submitAnswer',
                          answer: answerRef.current!.getMarkdown(),
                        })
                      }
                    >
                      {t('Submit')}
                    </button>
                  </div>
                </>
              );
            })
            .with(
              P.union(enVal(QueryStatus.Reviewing), enVal(QueryStatus.AttendeeReviewing)),
              () => {
                const query = withQuery(doc.flow, progress.view);
                return (
                  <>
                    <div className="w-full flex-1 place-content-center p-4 text-center text-2xl font-light">
                      <Markdown>{query.question}</Markdown>
                    </div>
                    <div className="w-full flex-1 place-content-center rounded-box bg-base-200 p-4 text-center text-2xl font-light">
                      <Markdown>{query.revelation}</Markdown>
                    </div>
                    <button
                      className="btn btn-primary"
                      onClick={() => dispatchEdit({ action: 'okFromAttendee' })}
                    >
                      {t('Next')}
                    </button>
                  </>
                );
              },
            )
            .exhaustive(),
        )
        .with({ status: 'finished' }, ({ printable }) => (
          <>
            {t('Thanks for participation')}
            <div className="text-center">
              {printable ?
                <Trans i18nKey="You can download the transcript now">
                  You can
                  <a href={`/api/transcript/${uuid}`} className="link">
                    download
                  </a>
                  the transcript now.
                </Trans>
              : <WithSpinner>{t('Transcript shall be available soon')}</WithSpinner>}
            </div>
          </>
        ))
        .exhaustive(),
    )
    .otherwise(() => null);

  return (
    <>
      <Navbar
        title={
          <div className="ml-4 text-xl">
            {zerra.doc?.title ?? <WithSpinner>{t('Loading')}</WithSpinner>}
          </div>
        }
        items={null}
        showHome={false}
      />

      <div className="flex w-full flex-1 flex-col place-content-center place-items-center gap-4 p-4 sm:w-5/6 lg:w-2/3">
        <Message>{message}</Message>
        {zerra.status === 'connected' ? content : null}
      </div>

      <dialog className="modal" ref={abortModal}>
        <div className="modal-box">
          <h3 className="text-lg font-bold">{t('Aborting')}</h3>
          <p>{t('Are you sure to abort?')}</p>
          <div className="modal-action">
            <form method="dialog" className="flex flex-row gap-4">
              <button className="btn">{t('No')}</button>
              <button
                className="btn btn-error"
                onClick={() => zerra.dispatchDoc({ action: 'skip' })}
              >
                {t('Yes')}
              </button>
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}
