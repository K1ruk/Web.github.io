import {serverDb} from '@/lib/supabase/server';
export const dynamic='force-dynamic';
export default async function Schedule(){let matches:{id:string;stage:string;status:string;scheduled_at:string|null}[]=[];
 if(process.env.NEXT_PUBLIC_SUPABASE_URL){const db=await serverDb();const {data}=await db.from('matches').select('id,stage,status,scheduled_at').order('scheduled_at',{ascending:true}).limit(100);matches=data||[];}
 return <main className="content-page"><div className="section-kicker">MATCHES / CALENDAR</div><h1 className="page-heading">SCHEDULE</h1><div className="panel margin-top">{matches.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>DATE</th><th>STAGE</th><th>STATUS</th></tr></thead><tbody>{matches.map(m=><tr key={m.id}><td>{m.scheduled_at?new Date(m.scheduled_at).toLocaleString():'TBA'}</td><td>{m.stage}</td><td>{m.status}</td></tr>)}</tbody></table></div>:<p className="muted">No matches have been scheduled.</p>}</div></main>;
}
