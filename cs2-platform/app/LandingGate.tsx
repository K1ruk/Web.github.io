'use client';

import { useEffect, useState } from 'react';
import { Home } from './Home';
import { OnboardingClient } from './onboarding/OnboardingClient';

type Tournament = { id:string; name:string; status:string; capacity:number; fee_cents:number; currency:string; starts_at:string|null; paid:number };
export function LandingGate({ tournament, authenticated }:{ tournament:Tournament|null; authenticated:boolean }) {
  const [showHome,setShowHome] = useState<boolean|null>(authenticated ? true : null);
  useEffect(()=>{
    if(authenticated) { setShowHome(true); return; }
    setShowHome(localStorage.getItem('nexus-intro-dismissed') === '1');
  },[authenticated]);
  if(showHome===null) return <main className="nx-landing-check" aria-label="Loading NEXUS"/>;
  if(showHome) return <Home tournament={tournament}/>;
  return <OnboardingClient authenticated={false} discordConnected={false}
    steamId={null} profile={null} onBrowse={()=>setShowHome(true)}/>;
}
