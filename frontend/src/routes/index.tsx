import * as icons from '@heroicons/react/24/outline';
import { createFileRoute } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Toaster, toast } from 'sonner';
import { P, match } from 'ts-pattern';

import { useZerraList } from '../api/list';

import Message from '../fragments/Message';
import Navbar from '../fragments/Navbar';
import Reload from '../fragments/Reload';
import Toast from '../fragments/Toast';
import WithSpinner from '../fragments/WithSpinner';

export const Route = createFileRoute('/')({ component: Index });

type DeleteArgs = { uuid: string; title: string };

function Index() {
  const { t } = useTranslation();

  const zerrae = useZerraList({
    onActionError: (action) => {
      toast.custom(() => (
        <Toast>
          {match(action)
            .with({ action: 'new' }, () => t('Failed to create new zerra'))
            .with({ action: 'import' }, () => t('Failed to import the file'))
            .with({ action: 'copy' }, ({ uuid }) =>
              t('Failed to copy zerra', { name: zerrae.items!.find((z) => z.id == uuid)!.name }),
            )
            .with({ action: 'delete' }, ({ uuid }) =>
              t('Failed to delete zerra', { name: zerrae.items!.find((z) => z.id == uuid)!.name }),
            )
            .exhaustive()}
        </Toast>
      ));
    },
  });

  const message =
    zerrae.fetchStatus === 'pending' ? <WithSpinner>{t('Connecting')}</WithSpinner>
    : zerrae.fetchStatus === 'error' ? <Reload>{t('Something went wrong')}</Reload>
    : null;

  const deleteModal = useRef<HTMLDialogElement>(null);
  const [deleteArgs, setDeleteArgs] = useState(null as DeleteArgs | null);
  const attemptDelete = (args: DeleteArgs) => {
    setDeleteArgs(args);
    deleteModal.current?.showModal();
  };

  const importFile = useRef<HTMLInputElement>(null);

  return (
    <>
      <Navbar showHome={false} />
      <div className="flex w-full flex-1 flex-col gap-4 p-4 sm:w-5/6 lg:w-2/3">
        <Message>{message}</Message>

        {zerrae.items
          ?.sort((a, b) => Date.parse(b.last_modified) - Date.parse(a.last_modified))
          .map(({ name, id }) => (
            <div key={id} className="flex gap-4 rounded-box bg-base-200 p-4">
              <div className="my-auto flex-1 text-lg">{name}</div>
              <a className="btn btn-square" href={`/api/export/${id}`}>
                <icons.ArrowUpOnSquareStackIcon aria-label={t('Export')} className="size-5" />
              </a>
              <button
                className="btn btn-square"
                onClick={() => attemptDelete({ uuid: id, title: name })}
              >
                <icons.XMarkIcon aria-label={t('Delete')} className="size-5" />
              </button>
              <button
                className="btn btn-square"
                onClick={() => zerrae.dispatchAction({ action: 'copy', uuid: id })}
              >
                <icons.DocumentDuplicateIcon aria-label={t('Copy')} className="size-5" />
              </button>
              <a className="btn btn-square" href={`/conduct/${id}`}>
                <icons.PlayIcon aria-label={t('Conduct')} className="size-5" />
              </a>
              <a className="btn btn-square" href={`/edit/${id}`}>
                <icons.PencilIcon aria-label={t('Edit')} className="size-5" />
              </a>
            </div>
          ))}

        <div className="join flex w-full">
          <button
            className="btn join-item flex-1"
            onClick={() => zerrae.dispatchAction({ action: 'new' })}
          >
            <icons.PlusIcon className="size-5" /> {t('Add new zerra')}
          </button>
          <button className="btn join-item" onClick={() => importFile.current?.click()}>
            <icons.ArrowDownOnSquareStackIcon className="size-5" /> {t('Import')}
          </button>
        </div>
        <input
          type="file"
          className="hidden"
          ref={importFile}
          accept=".yml,.yaml,application/yaml,text/yaml,application/x-yaml,text/x-yaml"
          onChange={(e) =>
            match(e.target.files?.[0]).with(P.nonNullable, (yaml) =>
              zerrae.dispatchAction({ action: 'import', yaml }),
            )
          }
        />
      </div>

      <dialog className="modal" ref={deleteModal}>
        <div className="modal-box">
          <h3 className="text-lg font-bold">{t('Deleting zerra', { name: deleteArgs?.title })}</h3>
          <p>{t('Are you sure?')}</p>
          <div className="modal-action">
            <form method="dialog" className="flex flex-row gap-4">
              <button className="btn">{t('Cancel')}</button>
              <button
                className="btn btn-error"
                onClick={() => zerrae.dispatchAction({ action: 'delete', uuid: deleteArgs!.uuid })}
              >
                {t('Delete')}
              </button>
            </form>
          </div>
        </div>
      </dialog>

      <Toaster />
    </>
  );
}
