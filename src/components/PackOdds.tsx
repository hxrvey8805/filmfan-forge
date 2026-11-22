import {PACK_ODDS,PACK_ROSTER,type PackType} from '../../supabase/functions/_shared/pack-catalogue';
export function PackOdds({type,legacy=false}:{type?:PackType;legacy?:boolean}){
  return <details className="pack-odds"><summary>Pack odds & details</summary>
    {legacy&&<p>This card was revealed before the new odds. The odds below apply to new reveals.</p>}<dl>{PACK_ODDS.map(t=><div key={t.id}><dt>{t.label}{type&&<small>{PACK_ROSTER[type][t.id].length} names</small>}</dt><dd>{t.weight}%</dd></div>)}</dl>
    <p>Equal chance for each name within its category. Each pack is an independent draw; duplicates can occur. Retrying keeps the same draw.</p>
    <p>CineGeek categories celebrate different careers; they aren’t ratings of talent. Cards can’t be sold. Skipping or replacing doesn’t return XP.</p>
  </details>;
}
