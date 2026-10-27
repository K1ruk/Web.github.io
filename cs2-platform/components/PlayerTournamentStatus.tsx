import Link from 'next/link';
import { getTournamentStage } from '@/lib/player-tournament-stage';

export type PlayerTeammate = {
  nickname: string;
  role: string;
  tier: number | null;
  isYou: boolean;
};
export type PlayerFixture = {
  id: string;
  opponentName: string;
  scheduledAt: string | null;
  stage: string;
  bestOf: number;
  status: string;
  score: string | null;
};
export type PlayerTournamentSnapshot = {
  id: string;
  eventName: string;
  eventStatus: string;
  registrationStatus: string;
  tier: number | null;
  teamName: string | null;
  assignedRole?: string | null;
  teammates: PlayerTeammate[];
  fixtures: PlayerFixture[];
};

type Props = {
  snapshot: PlayerTournamentSnapshot | null;
  demo?: boolean;
  locale?: 'en' | 'mn';
};

export function PlayerTournamentStatus({ snapshot, demo = false, locale = 'en' }: Props) {
  const mn=locale==='mn';
  const state=getTournamentStage(snapshot);
  const steps=[
    {label:mn?'Бүртгэл':'Registration',done:!!snapshot&&snapshot.registrationStatus==='paid'},
    {label:mn?'Түвшин':'Tier review',done:snapshot?.tier!==null&&snapshot?.tier!==undefined},
    {label:mn?'Баг':'Team reveal',done:state==='roster'},
  ];
  const headline=state==='no-entry'
    ?(mn?'Таны дараагийн тэмцээн':'Your next tournament starts here')
    :state==='unconfirmed'
      ?(mn?'Бүртгэл баталгаажаагүй':'Finish confirming your entry')
      :state==='awaiting-tier'
        ?(mn?'Түвшний хяналт хүлээгдэж байна':'Entry confirmed. Tier review is next.')
        :state==='tier-approved'
          ?(mn?'Түвшин батлагдсан. Баг хүлээгдэж байна':'Tier approved. Team reveal is next.')
          :(mn?'Таны баг бэлэн боллоо':'Your squad is ready.');
  const description=state==='no-entry'
    ? 'You have no active tournament entry. Choose an open event to start your registration.'
    :state==='unconfirmed'
      ? 'You started an entry, but your place is not confirmed yet. Check the event registration page.'
      :state==='awaiting-tier'
        ? "Your registration is confirmed. Admins are reviewing your skill tier; you don\'t need to do anything yet."
        :state==='tier-approved'
          ? 'Your tier is approved. Team assignments stay private until the organizer publishes the rosters.'
          : 'Your official squad is live. Check your role, teammates and upcoming matches below.';

  const nextStep=state==='no-entry'
    ? (mn?'Нээлттэй тэмцээнийг сонгож бүртгүүлнэ үү.':'Find an open tournament and register to enter.')
    : state==='unconfirmed'
      ? (mn?'Бүртгэлийн төлөвөө шалгаж, шаардлагатай алхмыг дуусгана уу.':'Check your registration and complete any outstanding steps.')
      : state==='awaiting-tier'
        ? (mn?'Зохион байгуулагч таны түвшинг батална.':'The organizer reviews your tier. No action needed.')
        : state==='tier-approved'
          ? (mn?'Багуудыг нийтлэхийг хүлээнэ үү.':'Wait for the official team announcement.')
          : (mn?'Багийнхантайгаа холбогдож, тоглолтын хуваарийг шалгана уу.':'Meet your squad and check the match schedule.');
  return <section className={'nx-player-event'+(demo?' nx-player-event-demo':'')} aria-label="My tournament journey">
    <header className="nx-player-event-header">
      <div className="nx-player-event-kicker">
        <span>{demo?'INTERACTIVE PLAYER PREVIEW':'MY TOURNAMENT'}</span>
        <span className={'nx-player-event-state '+(state==='roster'?'is-published':'')}>
          {demo?'SIMULATION':state==='roster'?'ROSTER LIVE':snapshot?.registrationStatus==='paid'?'ENTRY CONFIRMED':'NOT YET ENTERED'}
        </span>
      </div>
      <h2>{headline}</h2>
      <p>{description}</p>
    </header>
    <div className="nx-player-journey" aria-label="Tournament progress">
      {steps.map((step,i)=><div key={step.label} className={'nx-player-journey-step'+(step.done?' is-done':'')}>
        <span className="nx-player-journey-marker" aria-hidden="true">{step.done?'✓':String(i+1).padStart(2,'0')}</span>
        <div><strong>{step.label}</strong><small>{step.done?'COMPLETE':'PENDING'}</small></div>
      </div>)}
    </div>

    <div className="nx-player-next-step">
      <div><span>{mn?'ДАРААГИЙН АЛХАМ':'YOUR NEXT STEP'}</span><strong>{nextStep}</strong></div>
      {!demo&&(state==='no-entry'||state==='unconfirmed')&&<Link className="outline-button small" href="/register">
        {mn?'БҮРТГЭЛ РҮҮ':'GO TO REGISTRATION'} <span aria-hidden="true">↗</span>
      </Link>}
    </div>
    {snapshot?<div className="nx-player-event-details">
      <div className="nx-player-event-summary">
        <div><small>TOURNAMENT</small><strong>{snapshot.eventName}</strong></div>
        <div><small>MY TIER</small><strong>{snapshot.tier!==null?'TIER '+snapshot.tier:'AWAITING REVIEW'}</strong></div>
        <div><small>MY TEAM</small><strong>{state==='roster'?(snapshot.teamName||'—'):'NOT PUBLISHED YET'}</strong></div>
      </div>
      {state==='roster'&&<>
        <div className="nx-player-section-heading">
          <div><span>TEAM LINEUP</span><h3>{snapshot.teamName}</h3></div>
          <small>OFFICIAL FIVE-PLAYER SQUAD</small>
        </div>
        <div className="nx-player-roster">
          {snapshot.teammates.map((member,i)=><div className={'nx-player-roster-member'+(member.isYou?' is-me':'')} key={member.nickname+'-'+i}>
            <span className="nx-player-roster-index">{String(i+1).padStart(2,'0')}</span>
            <div className="nx-player-roster-name"><strong>{member.nickname}{member.isYou&&<em>YOU</em>}</strong><small>{member.role}</small></div>
            <span className="nx-player-roster-tier">{member.tier===null?'—':'T'+member.tier}</span>
          </div>)}
        </div>
        <div className="nx-player-section-heading nx-player-fixtures-heading">
          <div><span>TOURNAMENT SCHEDULE</span><h3>Upcoming matches</h3></div>
        </div>
        {snapshot.fixtures.length?
          <div className="nx-player-fixtures">
            {snapshot.fixtures.map(f=><div className="nx-player-fixture" key={f.id}>
              <div><small>{f.stage.toUpperCase()} · BO{f.bestOf}</small><strong>{snapshot.teamName} <span>VS</span> {f.opponentName}</strong></div>
              <span>{f.score??(f.scheduledAt?new Date(f.scheduledAt).toLocaleString(locale==='mn'?'mn-MN':'en-GB'):'TIME TBA')}</span>
            </div>)}
          </div>
          :<p className="nx-player-event-empty">No match time announced yet. Check here after the admin publishes the schedule.</p>}
      </>}
    </div>:<div className="nx-player-event-empty">
      <p>You haven't confirmed an entry yet.</p>
    </div>}
    {demo&&<p className="nx-player-demo-disclaimer">This shows how a real player dashboard would look at this stage. The entry, tier, squad and schedule here are examples only—no actual assignment has been published.</p>}
  </section>;
}
