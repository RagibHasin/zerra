import * as icons from '@heroicons/react/24/outline';
import { ReactNode } from 'react';
import { Trans } from 'react-i18next';

type Props = { children: ReactNode };

export default function Reload({ children }: Props) {
  return (
    <>
      <icons.ExclamationTriangleIcon className="inline size-4" /> {children}
      <Trans
        i18nKey="try reloading"
        components={{ btn: <button className="link" onClick={() => window.location.reload()} /> }}
      />
    </>
  );
}
