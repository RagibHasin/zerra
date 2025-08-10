import * as icons from '@heroicons/react/24/outline';
import { createFileRoute } from '@tanstack/react-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { match } from 'ts-pattern';

import useZerraEditor from '../api/edit';

import Message from '../fragments/Message';
import Navbar from '../fragments/Navbar';
import QueryCard from '../fragments/QueryCard';
import Reload from '../fragments/Reload';
import WithSpinner from '../fragments/WithSpinner';

import { QueryStatus, displayOf, enVal, idOf, nextVisible } from '../model';

export const Route = createFileRoute('/edit/$uuid')({ component: Edit });

function Edit() {
  const { t } = useTranslation();

  const { uuid } = Route.useParams();
  const zerra = useZerraEditor(uuid);

  const message =
    zerra.state === 'connecting' ? <WithSpinner>{t('Connecting')}</WithSpinner>
    : zerra.state === 'disconnected' ? <Reload>{t('Connection lost')}</Reload>
    : null;

  const clearModal = useRef<HTMLDialogElement>(null);

  const progress = match(zerra.doc?.progress)
    .with({ status: 'ongoing' }, (progress) => (
      <div className="flex place-content-center place-items-center gap-4">
        <div className="flex-1">
          {t('Participated by ', { participant_name: progress.participant_name })}
        </div>
        <div className="flex-none">
          {match(progress.query_status)
            .with(enVal(QueryStatus.Deciding), () => (
              <>
                {t('Up next : ')}
                <a href={'#' + idOf(progress.view)} className="link">
                  {displayOf(progress.view, t)}
                </a>
              </>
            ))
            .with(enVal(QueryStatus.Answering), () => (
              <>
                {t('Answering : ')}
                <a href={'#' + idOf(progress.view)} className="link">
                  {displayOf(progress.view, t) + ' '}
                </a>
              </>
            ))
            .with(enVal(QueryStatus.Reviewing), () => (
              <>
                {t('Reviewing : ')}
                <a href={'#' + idOf(progress.view)} className="link">
                  {displayOf(progress.view, t)}
                </a>
              </>
            ))
            .with(enVal(QueryStatus.AttendeeReviewing), () => {
              const nextView = nextVisible(zerra.doc!.flow, progress.view);
              return nextView === null ?
                  <>{t('Finishing')}</>
                : <>
                    {t('Up next : ')}
                    <a href={'#' + idOf(nextView)} className="link">
                      {displayOf(nextView, t) + ' '}
                    </a>
                  </>;
            })
            .exhaustive()}
        </div>
        <div className="flex-1 place-content-end">
          <button
            className="btn btn-sm"
            onClick={() => zerra.dispatchDoc({ action: 'clearProgress' })}
          >
            <icons.TrashIcon className="size-4" /> {t('Clear progress')}
          </button>
        </div>
      </div>
    ))
    .with({ status: 'finished' }, (progress) => (
      <div className="flex place-content-center place-items-center gap-4">
        <div className="flex-1">
          {t('Participated by ', { participant_name: progress.participant_name })}
        </div>
        <div className="flex-none">{t('Finished')}</div>
        <div className="flex flex-1 place-content-end gap-4">
          <button
            className="btn btn-xs"
            onClick={() => zerra.dispatchDoc({ action: 'togglePrintable' })}
          >
            {progress.printable ?
              <>
                <icons.FireIcon className="size-4" /> {t('Make unprintable')}
              </>
            : <>
                <icons.PrinterIcon className="size-4" /> {t('Make printable')}
              </>
            }
          </button>
          <button className="btn btn-xs" onClick={() => clearModal.current?.showModal()}>
            <icons.TrashIcon className="size-4" /> {t('Clear progress')}
          </button>
        </div>
      </div>
    ))
    .otherwise(() => null);

  return (
    <>
      <Navbar
        title={
          zerra.doc !== null ?
            <input
              type="text"
              className="input-xl w-full input-ghost"
              defaultValue={zerra.doc.title}
              onChange={(e) => zerra.dispatchDoc({ action: 'setTitle', title: e.target.value })}
            />
          : <div className="ml-4 text-xl">
              <WithSpinner>{t('Loading')}</WithSpinner>
            </div>
        }
      />

      <div className="flex w-full flex-1 flex-col gap-4 p-4 sm:w-5/6 lg:w-2/3">
        <Message>{message}</Message>

        {progress}

        {zerra.doc?.flow.map((query, index) => (
          <QueryCard
            key={query.key}
            query={query}
            path={[index]}
            doc={zerra.doc!}
            dispatchDoc={zerra.dispatchDoc}
          />
        ))}

        <button
          className="btn btn-block"
          onClick={() => zerra.dispatchDoc({ action: 'insert', path: [zerra.doc!.flow.length] })}
        >
          <icons.PlusIcon className="size-5" /> {t('Add query')}
        </button>
      </div>

      <dialog className="modal" ref={clearModal}>
        <div className="modal-box">
          <h3 className="text-lg font-bold">{t('Clearing progress')}</h3>
          <p>{t('Are you sure to clear?')}</p>
          <div className="modal-action">
            <form method="dialog" className="flex flex-row gap-4">
              <button className="btn">{t('No')}</button>
              <button
                className="btn btn-error"
                onClick={() => zerra.dispatchDoc({ action: 'clearProgress' })}
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
