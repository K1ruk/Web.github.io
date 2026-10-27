'use client';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
type Locale='en'|'mn';
const Context=createContext<{locale:Locale,setLocale:(locale:Locale)=>void}>({locale:'en',setLocale:()=>{}});
export function LocaleProvider({children}:{children:ReactNode}){
 const [locale,setLocale]=useState<Locale>('en');
 useEffect(()=>{const saved=localStorage.getItem('nexus-language');if(saved==='en'||saved==='mn')setLocale(saved);},[]);
 const change=(value:Locale)=>{setLocale(value);localStorage.setItem('nexus-language',value);document.documentElement.lang=value;};
 return <Context.Provider value={{locale,setLocale:change}}>{children}</Context.Provider>;
}
export function useLocale(){return useContext(Context);}
export function Bilingual({en,mn}:{en:string,mn:string}){const {locale}=useLocale();return <>{locale==='mn'?mn:en}</>;}
