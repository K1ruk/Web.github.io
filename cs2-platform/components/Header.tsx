'use client';
import Link from 'next/link';import {usePathname} from 'next/navigation';import {useLocale} from './LocaleProvider';
const links=[['/','HOME','НҮҮР'],['/players','PLAYERS','ТОГЛОГЧИД'],['/teams','TEAMS','БАГУУД'],['/register','REGISTER','БҮРТГЭЛ'],['/dashboard','MY ACCOUNT','МИНИЙ ХАЯГ']];
export function Header(){const {locale,setLocale}=useLocale();const path=usePathname();
 return <header className="site-header"><Link className="logo" href="/" aria-label="Nexus home"><span className="brand-symbol">✳</span> NEXUS<span className="brand-period">.</span></Link>
 <nav className="main-nav" aria-label="Main menu">{links.map(([href,en,mn])=><Link href={href} key={href} className={path===href?'nav-current':''}>{locale==='en'?en:mn}</Link>)}</nav>
 <div className="header-end"><div className="locale-switch" aria-label="Language"><button className={locale==='en'?'selected':''} onClick={()=>setLocale('en')} aria-pressed={locale==='en'}>EN</button><span>/</span><button className={locale==='mn'?'selected':''} onClick={()=>setLocale('mn')} aria-pressed={locale==='mn'}>МН</button></div><Link href="/login" className="outline-button small">{locale==='en'?'SIGN IN':'НЭВТРЭХ'}</Link></div></header>;
}
