import Link from 'next/link';

export const metadata = {
  title: 'Tournament Rules | NEXUS',
  description: 'Core participation and fair-play rules for free NEXUS CS2 tournaments.',
};

export default function TournamentRulesPage() {
  return <main className="content-page">
    <div className="section-kicker">NEXUS / FREE EVENT RULES · v1</div>
    <h1 className="page-heading">PLAY FAIR. PLAY TOGETHER.</h1>
    <p className="lead">These are the baseline rules for free NEXUS CS2 tournaments. Event-specific scheduling and match format are announced separately by the organizers.</p>
    <div className="stack margin-top">
      <section className="panel">
        <h2>01 / VERIFIED PLAYER</h2>
        <p>Each participant must sign in with their own Discord identity, verify the Steam account they will play on, and enter a valid CS2 nickname and two preferred roles. Playing under another participant's account is prohibited.</p>
      </section>
      <section className="panel">
        <h2>02 / FAIR PLAY</h2>
        <p>Cheats, exploits, account sharing, intentional throwing, match fixing, and harassment are prohibited. Organizers may investigate evidence and apply proportionate sanctions. A statistical anomaly or rating alone is never proof of cheating.</p>
      </section>
      <section className="panel">
        <h2>03 / TEAM ALLOCATION</h2>
        <p>This is a solo-entry tournament. Administrators review FACEIT Elo and available historical statistics, manually approve each player's Tier 1–5, and review balanced five-player rosters before publishing. Preferred roles are considered but not guaranteed.</p>
      </section>
      <section className="panel">
        <h2>04 / MATCHES AND RESULTS</h2>
        <p>Follow the organizer's confirmed schedule and format. Report disconnects, disputes, or rule violations promptly, with evidence when available. Only organizer-verified results are considered official NEXUS tournament results.</p>
      </section>
      <section className="panel">
        <h2>05 / DATA AND PLAYER ANALYSIS</h2>
        <p>NEXUS may use verified Steam and FACEIT data to provide the admin with team-balancing evidence. Club history and tournament performance are kept distinct. Round-derived KAST is only recorded when actual demo analysis can verify it; missing values are not estimated as facts.</p>
      </section>
    </div>
    <p className="small-text margin-top">Version v1. Participation confirms that you have read these rules. These rules do not replace any event-specific details communicated before registration.</p>
    <Link href="/register" className="outline-button margin-top">BACK TO TOURNAMENT REGISTRATION</Link>
  </main>;
}
