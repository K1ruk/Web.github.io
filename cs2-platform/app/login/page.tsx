'use client';

import { FormEvent, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';
import { useLocale } from '@/components/LocaleProvider';

type Busy = 'discord' | 'email' | null;

export default function Login() {
  const { locale } = useLocale();
  const mn = locale === 'mn';
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<Busy>(null);

  function getAuthClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      setMessage(mn ? 'Supabase тохиргоо дутуу байна.' : 'Supabase credentials are not configured.');
      return null;
    }
    return createBrowserClient(url, key);
  }

  async function signInWithDiscord() {
    setMessage('');
    const db = getAuthClient();
    if (!db) return;

    setBusy('discord');
    try {
      const { error } = await db.auth.signInWithOAuth({
        provider: 'discord',
        options: {
          redirectTo: `${location.origin}/auth/callback`,
          scopes: 'identify email',
        },
      });
      if (error) setMessage(error.message);
    } catch {
      setMessage(mn ? 'Discord нэвтрэлт эхэлсэнгүй. Дахин оролдоно уу.' : 'Could not start Discord sign-in. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function signInWithEmail(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    const db = getAuthClient();
    if (!db) return;

    setBusy('email');
    try {
      const { error } = await db.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${location.origin}/auth/callback`,
        },
      });
      setMessage(
        error
          ? error.message
          : mn
            ? 'Нэвтрэх холбоосыг имэйлээр илгээлээ.'
            : 'Check your email for a sign-in link.',
      );
    } catch {
      setMessage(mn ? 'Имэйл илгээж чадсангүй.' : 'Could not send the sign-in email.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="content-page">
      <div className="section-kicker">ACCOUNT / 01</div>
      <h1 className="page-heading">{mn ? 'НЭВТРЭХ' : 'SIGN IN'}</h1>
      <p className="lead">
        {mn
          ? 'Discord ашиглан нэвтэрнэ үү. Тэмцээнд бүртгүүлэхийн өмнө Steam хаягаа баталгаажуулна.'
          : 'Sign in with Discord. Verify your Steam account before joining a tournament.'}
      </p>

      <div className="panel" style={{ maxWidth: 530, marginTop: 35 }}>
        <div className="section-kicker" style={{ marginBottom: 18 }}>
          {mn ? 'ҮНДСЭН НЭВТРЭЛТ' : 'QUICK SIGN IN'}
        </div>
        <button
          className="outline-button"
          type="button"
          onClick={signInWithDiscord}
          disabled={busy !== null}
          style={{
            width: '100%',
            minHeight: 58,
            borderColor: '#8e90f166',
            background: '#5865f211',
            justifyContent: 'center',
          }}
        >
          <span>{busy === 'discord' ? '...' : mn ? 'DISCORD-ООР НЭВТРЭХ' : 'CONTINUE WITH DISCORD'}</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 13, margin: '29px 0', color: '#777', fontSize: 10, letterSpacing: '.18em' }}>
          <span style={{ height: 1, background: '#ffffff23', flex: 1 }} />
          {mn ? 'ЭСВЭЛ ИМЭЙЛ' : 'OR EMAIL'}
          <span style={{ height: 1, background: '#ffffff23', flex: 1 }} />
        </div>

        <form onSubmit={signInWithEmail}>
          <div className="form-row">
            <label className="field-label" htmlFor="email">EMAIL</label>
            <input
              id="email"
              className="field"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <button className="outline-button" type="submit" disabled={busy !== null} style={{ width: '100%' }}>
            {busy === 'email' ? '...' : mn ? 'ИМЭЙЛ ХОЛБООС ИЛГЭЭХ' : 'SEND EMAIL LINK'}
            <span className="button-line" />
          </button>
        </form>

        {message && <p className="form-message margin-top" role="status">{message}</p>}
      </div>
      <p className="small-text margin-top"><Link href="/">← {mn ? 'НҮҮР' : 'HOME'}</Link></p>
    </main>
  );
}
