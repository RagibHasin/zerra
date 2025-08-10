import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import Navbar from '../fragments/Navbar';

export const Route = createFileRoute('/login')({ component: Login });

function Login() {
  const { t } = useTranslation();

  return (
    <>
      <Navbar items={null} showHome={false} />
      <div className="grid w-full flex-1 content-center justify-stretch p-4 sm:w-2/3 md:w-1/2 lg:w-1/3">
        <form className="fieldset w-full" method="post">
          <div className="text-xl font-light">{t('Sign in')}</div>
          <input type="text" className="input w-full" name="username" placeholder={t('Name')} />
          <input
            type="password"
            className="input w-full"
            name="password"
            placeholder={t('Password')}
          />
          <input type="submit" className="btn btn-primary" value={t('Okay')} />
        </form>
      </div>
    </>
  );
}
