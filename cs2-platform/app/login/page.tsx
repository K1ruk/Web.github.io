'use client';
import {FormEvent,useState} from 'react';import {createBrowserClient} from '@supabase/ssr';import Link from 'next/link';import {useLocale} from '@/components/LocaleProvider';
export default function Login(){const {locale}=useLocale(),mn=locale==='mn';const [email,setEmail]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setMessage('');
  if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY){setMessage('Configure Supabase credentials before signing in.');return;}
  setBusy(true);
  const db=createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const {error}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:(process.env.NEXT_PUBLIC_SITE_URL||location.origin)+'/auth/callback?next=/dashboard'}});
  setMessage(error?error.message:(mn?'Нэвтрэх холбоосыг имэйлээр илгээлээ.':'Check your email for a sign-in link.'));setBusy(false);
 }
 return <main className="content-page"><div className="section-kicker">ACCOUNT / 01</div><h1 className="page-heading">{mn?'НЭВТРЭХ':'SIGN IN'}</h1><p className="lead">{mn?'Имэйл хаягаараа нэвтэрнэ. Дараа нь Steam хаягаа баталгаажуулна.':'Sign in by email. Link and verify your Steam account afterwards.'}</p><div className="panel" style={{maxWidth:530,marginTop:35}}><form onSubmit={submit}><div className="form-row"><label className="field-label" htmlFor="email">EMAIL</label><input id="email" className="field" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></div><button className="outline-button" type="submit" disabled={busy}>{busy?'...':(mn?'ХОЛБООС ИЛГЭЭХ':'SEND SIGN-IN LINK')}<span className="button-line"/></button></form>{message&&<p className="form-message margin-top" role="status">{message}</p>}</div><p className="small-text margin-top"><Link href="/">← {mn?'НҮҮР':'HOME'}</Link></p></main>;
}
