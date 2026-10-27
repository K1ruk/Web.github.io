import type {Metadata} from 'next';import type {ReactNode} from 'react';
import './globals.css';import {Header} from '@/components/Header';import {LocaleProvider} from '@/components/LocaleProvider';
export const metadata:Metadata={title:'NEXUS / CS2',description:'CS2 solo tournament registration, teams, schedule and player ranking',robots:{index:false,follow:false}};
export default function RootLayout({children}:{children:ReactNode}){return <html lang="en"><body><LocaleProvider><div className="page-shell"><Header/>{children}<footer className="site-footer"><span>NEXUS / CS2</span><span>© 2026 · PRIVATE PREVIEW</span></footer></div></LocaleProvider></body></html>;}
