'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useLocale } from './LocaleProvider';

const links = [
  ['/', 'HOME', 'НҮҮР'],
  ['/players', 'PLAYERS', 'ТОГЛОГЧИД'],
  ['/teams', 'TEAMS', 'БАГУУД'],
  ['/schedule', 'SCHEDULE', 'ХУВААРЬ'],
  ['/register', 'REGISTER', 'БҮРТГЭЛ'],
  ['/dashboard', 'MY ACCOUNT', 'МИНИЙ ХАЯГ'],
] as const;

type AuthState = 'loading' | 'signed-in' | 'signed-out';

export function Header() {
  const { locale, setLocale } = useLocale();
  const path = usePathname();
  const [authState, setAuthState] = useState<AuthState>('loading');

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      setAuthState('signed-out');
      return;
    }

    const db = createBrowserClient(url, key);
    let mounted = true;

    // Reflect OAuth login and other session updates without a full reload.
    const { data: { subscription } } = db.auth.onAuthStateChange((_event, session) => {
      if (mounted) setAuthState(session?.user ? 'signed-in' : 'signed-out');
    });

    // Verify the current session on navigation, including after server-side sign out.
    db.auth.getUser()
      .then(({ data, error }) => {
        if (mounted) setAuthState(!error && data.user ? 'signed-in' : 'signed-out');
      })
      .catch(() => {
        if (mounted) setAuthState('signed-out');
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [path]);

  const mn = locale === 'mn';

  return (
    <header className="site-header">
      <Link className="logo" href="/" aria-label="Nexus home">
        <span className="brand-symbol" aria-hidden="true">✳</span> NEXUS<span className="brand-period">.</span>
      </Link>
      <nav className="main-nav" aria-label={mn ? 'Үндсэн цэс' : 'Main menu'}>
        {links.map(([href, en, mongolian]) => (
          <Link
            href={href}
            key={href}
            className={path === href ? 'nav-current' : ''}
            aria-current={path === href ? 'page' : undefined}
          >
            {mn ? mongolian : en}
          </Link>
        ))}
      </nav>
      <div className="header-end">
        <div className="locale-switch" aria-label="Language">
          <button className={mn ? '' : 'selected'} onClick={() => setLocale('en')} aria-pressed={!mn}>EN</button>
          <span>/</span>
          <button className={mn ? 'selected' : ''} onClick={() => setLocale('mn')} aria-pressed={mn}>МН</button>
        </div>
        {authState === 'loading' ? (
          <span className="header-auth-placeholder" aria-label={mn ? 'Нэвтрэлтийг шалгаж байна' : 'Checking account'} />
        ) : (
          <Link
            href={authState === 'signed-in' ? '/dashboard' : '/login'}
            className={'outline-button small header-auth-link' + (authState === 'signed-in' ? ' header-auth-active' : '')}
          >
            {authState === 'signed-in' && <span className="header-status-dot" aria-hidden="true" />}
            {authState === 'signed-in'
              ? (mn ? 'МИНИЙ ХАЯГ' : 'MY ACCOUNT')
              : (mn ? 'НЭВТРЭХ' : 'SIGN IN')}
          </Link>
        )}
      </div>
    </header>
  );
}
