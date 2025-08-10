import * as icons from '@heroicons/react/24/outline';
import { createFileRoute } from '@tanstack/react-router';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { P, match } from 'ts-pattern';

import { useZerraConductor } from '../api/participate';

import Message from '../fragments/Message';
import Navbar from '../fragments/Navbar';
import QueryCard from '../fragments/QueryCard';
import Reload from '../fragments/Reload';
import WithSpinner from '../fragments/WithSpinner';

import { QueryStatus, displayOf, enVal, idOf, nextVisible } from '../model';

export const Route = createFileRoute('/conduct/$uuid')({ component: Conduct });

function Conduct() {
  const { t } = useTranslation();

  const { uuid } = Route.useParams();
  const zerra = useZerraConductor(uuid);

  const message = match([zerra.doc?.progress.status, zerra.status])
    .with([P.any, 'connecting'], () => <WithSpinner>{t('Connecting')}</WithSpinner>)
    .with(P.union([P.any, 'waiting'], ['none', 'connected']), () => (
      <WithSpinner>{t('Waiting for attendee')}</WithSpinner>
    ))
    .with([P.any, 'connected'], () => null)
    .with([P.any, 'disconnected'], () => <Reload>{t('Connection lost')}</Reload>)
    .exhaustive();

  const attendLink = window.location.href.split('#')[0].replace('conduct', 'attend');
  const bannerContent = match(zerra.doc?.progress)
    .with(P.union(P.nullish, { status: 'none' }), () => null)
    .with({ status: 'intro' }, () => <WithSpinner>{t('Waiting for introduction')}</WithSpinner>)
    .with({ status: 'ongoing' }, (progress) => (
      <>
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
                <button
                  className="btn btn-square btn-ghost btn-xs"
                  onClick={() => zerra.dispatchDoc({ action: 'approveQuery' })}
                >
                  <icons.ChevronRightIcon className="size-4" />
                </button>
              </>
            ))
            .with(enVal(QueryStatus.Answering), () => (
              <>
                {t('Answering : ')}
                <a href={'#' + idOf(progress.view)} className="link">
                  {displayOf(progress.view, t)}
                </a>{' '}
                <WithSpinner />
              </>
            ))
            .with(enVal(QueryStatus.Reviewing), () => (
              <>
                {t('Reviewing : ')}
                <a href={'#' + idOf(progress.view)} className="link">
                  {displayOf(progress.view, t)}
                </a>
                <button
                  className="btn btn-square btn-ghost btn-xs"
                  onClick={() => zerra.dispatchDoc({ action: 'okFromConductor' })}
                >
                  <icons.ChevronRightIcon className="size-4" />
                </button>
              </>
            ))
            .with(enVal(QueryStatus.AttendeeReviewing), () => {
              const nextView = nextVisible(zerra.doc!.flow, progress.view);
              return nextView === null ?
                  <>
                    {t('Finishing')} <WithSpinner />
                  </>
                : <>
                    {t('Up next : ')}
                    <a href={'#' + idOf(nextView)} className="link">
                      {displayOf(nextView, t)}
                    </a>{' '}
                    <WithSpinner />
                  </>;
            })
            .exhaustive()}
        </div>
      </>
    ))
    .with({ status: 'finished' }, (progress) => (
      <>
        <div className="flex-1">
          {t('Participated by ', { participant_name: progress.participant_name })}
        </div>
        <div className="flex-none">
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
          {' ' + t('Finished')}
        </div>
      </>
    ))
    .exhaustive();

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

      <div className="sticky top-0 flex w-full place-content-center bg-accent/50 text-accent-content backdrop-blur-xs">
        <div className="flex w-full flex-col content-center justify-stretch gap-4 p-4 sm:w-5/6 lg:w-2/3">
          {zerra.status === 'connecting' || zerra.status === 'waiting' ?
            <div className="flex place-content-center place-items-center gap-4">
              <QRCodeSVG value={attendLink} marginSize={4} level="H" />
              <div className="text-lg">{attendLink}</div>
            </div>
          : null}
          {bannerContent !== null ?
            <div className="flex place-content-center place-items-center gap-4 px-4">
              {bannerContent}
            </div>
          : null}
        </div>
      </div>

      <div className="flex w-full flex-1 flex-col gap-4 p-4 sm:w-5/6 lg:w-2/3">
        <Message>{message}</Message>

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
    </>
  );
}
