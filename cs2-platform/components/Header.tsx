'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useLocale } from './LocaleProvider';

const links = [
  ['/', 'OVERVIEW', 'НҮҮР'],
  ['/players', 'PLAYERS', 'ТОГЛОГЧИД'],
  ['/teams', 'TEAMS', 'БАГУУД'],
  ['/schedule', 'SCHEDULE', 'ХУВААРЬ'],
] as const;

type AuthState = 'loading' | 'signed-in' | 'signed-out';

export function Header() {
  const { locale, setLocale } = useLocale();
  const path = usePathname();
  const [authState, setAuthState] = useState<AuthState>('loading');
  const mn = locale === 'mn';

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      setAuthState('signed-out');
      return;
    }

    const db = createBrowserClient(url, key);
    let mounted = true;
    const { data: { subscription } } = db.auth.onAuthStateChange((_event, session) => {
      if (mounted) setAuthState(session?.user ? 'signed-in' : 'signed-out');
    });
    db.auth.getUser().then(({ data, error }) => {
      if (mounted) setAuthState(!error && data.user ? 'signed-in' : 'signed-out');
    }).catch(() => {
      if (mounted) setAuthState('signed-out');
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [path]);

  return (
    <header className="site-header nx-site-header">
      <Link className="logo nx-site-brand" href="/" aria-label="Nexus tournament home">
        <span className="nx-brand-monogram" aria-hidden="true">N<span>.</span></span>
        <span className="nx-brand-wordmark">NEXUS<small>CS2 TOURNAMENTS</small></span>
      </Link>
      <nav className="main-nav nx-site-nav" aria-label={mn ? 'Үндсэн цэс' : 'Main navigation'}>
        {links.map(([href, en, mongolian]) => {
          const current = href === '/' ? path === '/' : path === href || path.startsWith(href + '/');
          return <Link key={href} href={href} className={current ? 'nav-current' : ''}
            aria-current={current ? 'page' : undefined}>{mn ? mongolian : en}</Link>;
        })}
      </nav>
      <div className="header-end nx-site-actions">
        <div className="locale-switch" aria-label="Language">
          <button type="button" className={mn ? '' : 'selected'} onClick={() => setLocale('en')} aria-pressed={!mn}>EN</button>
          <span>/</span>
          <button type="button" className={mn ? 'selected' : ''} onClick={() => setLocale('mn')} aria-pressed={mn}>МН</button>
        </div>
        {authState === 'signed-out' && <Link className="nx-site-signin" href="/login">{mn ? 'НЭВТРЭХ' : 'SIGN IN'}</Link>}
        {authState === 'loading'
          ? <span className="header-auth-placeholder" aria-label={mn ? 'Нэвтрэлтийг шалгаж байна' : 'Checking account'} />
          : <Link className={'outline-button small nx-site-primary' + (authState === 'signed-in' ? ' header-auth-active' : '')}
              href={authState === 'signed-in' ? '/dashboard' : '/register'}>
              {authState === 'signed-in' && <span className="header-status-dot" aria-hidden="true" />}
              {authState === 'signed-in' ? (mn ? 'МИНИЙ ПРОФАЙЛ' : 'MY DASHBOARD') : (mn ? 'БҮРТГҮҮЛЭХ' : 'JOIN EVENT')}
              <span aria-hidden="true">↗</span>
            </Link>}
      </div>
    </header>
  );
}
