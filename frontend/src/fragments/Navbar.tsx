import * as icons from '@heroicons/react/24/outline';
import cookie from 'js-cookie';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import i18n from '../i18n';

type Props = {
  title?: ReactNode;
  items?: ReactNode;
  showHome?: boolean;
};

export default function Navbar({ title, items, showHome }: Props) {
  const { t } = useTranslation();

  return (
    <div className="navbar gap-4 bg-accent/50 px-4 text-accent-content shadow-sm">
      <div className="flex flex-1 gap-4">
        {(showHome ?? true) ?
          <a className="grid size-8 content-center items-center" href="/">
            <icons.HomeIcon className="m-auto block size-6" />
          </a>
        : null}
        {title !== undefined ? title : <div className="ml-4 text-xl">{t('Zerra')}</div>}
      </div>
      <div className="flex-none">
        {items !== undefined ? items : <NavbarUser />}

        <div className="dropdown dropdown-end">
          <div tabIndex={0} role="button" className="btn btn-circle btn-ghost">
            <div className="w-8 rounded-full">
              <icons.GlobeAltIcon aria-label={t('Language')} className="m-auto block size-6" />
            </div>
          </div>
          <ul className="dropdown-content menu z-1 mt-4 w-48 rounded-box bg-base-200 p-2 shadow">
            {[
              ['bn', 'বাংলা'],
              ['en', 'English'],
            ].map(([code, name]) => (
              <LangOption key={code} code={code} name={name} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function NavbarUser() {
  const { t } = useTranslation();

  const username = cookie.get('username') || t('User');

  return (
    <div className="dropdown dropdown-end">
      <div tabIndex={0} role="button" className="btn btn-circle btn-ghost">
        <div className="w-8 rounded-full">
          <icons.UserIcon aria-label={username} className="m-auto block size-6" />
        </div>
      </div>
      <ul className="dropdown-content menu z-1 mt-4 w-48 rounded-box bg-base-200 p-2 shadow">
        <li className="menu-disabled">
          <span className="text-lg text-base-content">{username}</span>
        </li>
        <li>
          <a href="/logout">
            <icons.ArrowRightStartOnRectangleIcon aria-label={t("Logout")} className="size-4" />{' '}
            {t('Logout')}
          </a>
        </li>
      </ul>
    </div>
  );
}

type LangOptionProp = { code: string; name: string };

function LangOption({ code, name }: LangOptionProp) {
  return (
    <li className={i18n.language === code ? 'menu-disabled' : ''}>
      <button
        onClick={() => {
          cookie.set('lang', code, { path: '/', expires: 30 });
          void i18n.changeLanguage(code);
        }}
      >
        {name}
      </button>
    </li>
  );
}
