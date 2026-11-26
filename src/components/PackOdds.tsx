import {getPackCatalogue,PACK_CATALOGUE_VERSION,type PackType} from '../../supabase/functions/_shared/pack-catalogue';

export function PackOdds({type,drawn=false,version}:{type?:PackType;drawn?:boolean;version?:unknown}){
  const known=getPackCatalogue(version);
  const unknown=drawn&&version!=null&&!known;
  const unrecorded=drawn&&version==null;
  const previous=!!known&&version!==PACK_CATALOGUE_VERSION;
  const catalogue=unknown?undefined:known??getPackCatalogue(PACK_CATALOGUE_VERSION)!;
  const types:PackType[]=type?[type]:['actor','director'];
  return <details className="pack-odds"><summary>Pack odds & details</summary>
    {previous&&<p>This saved draw uses an earlier catalogue. Its original odds are shown below.</p>}
    {unrecorded&&<p>This older reveal has no recorded odds. The current odds below apply only to new draws.</p>}
    {unknown&&<p>This draw uses a catalogue this app cannot display yet. Update CineGeek to view its odds. Your saved card stays the same.</p>}
    {catalogue&&<>
      <dl>{catalogue.odds.map(t=><div key={t.id}><dt>{t.label}{type&&<small>{catalogue.roster[type][t.id]?.length} names</small>}</dt><dd>{t.weight}%</dd></div>)}</dl>
      <p>These are pool probabilities, not the chance of a particular person. Each name within a pool is equally likely. Draws are independent; duplicates can occur. Retrying keeps the same draw.</p>
      <details><summary>Names & individual chances</summary>
        {types.map(kind=><section key={kind} aria-label={kind==='actor'?'Actor pack probabilities':'Director pack probabilities'}>
          <h3>{kind==='actor'?'Actor packs':'Director packs'}</h3>
          {catalogue.odds.map(t=>{
            const names=catalogue.roster[kind][t.id]??[];
            return <details className="pack-odds-pool" key={t.id}><summary>{t.label} · {names.length} names</summary>
              <p>Each name: {t.weight}% ÷ {names.length} ≈ {(t.weight/names.length).toFixed(4)}% per {kind} pack.</p>
              <ul>{names.map(name=><li key={name}>{name}</li>)}</ul>
            </details>;
          })}
        </section>)}
      </details>
      <p>Pools determine selection chances, not talent or cash value. Cards can’t be sold. Skipping or replacing doesn’t return XP.</p>
    </>}
  </details>;
}
