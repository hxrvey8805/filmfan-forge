import type { ListSource } from "@/lib/list-sources";

type Props = { options: ListSource[]; selected?: string[]; onChange: (ids: string[] | undefined) => void };

export function SmartListSources({ options, selected, onChange }: Props) {
  return <fieldset className="list-sources">
    <legend>Match titles from</legend>
    <div className="list-source-modes">{[true, false].map(all =>
      <label key={String(all)}>
        <input type="radio" name="source-mode" checked={all === (selected === undefined)}
          onChange={() => onChange(all ? undefined : [])} />
        {all ? "All lists" : "Choose lists"}
      </label>
    )}</div>
    {selected !== undefined && <>
      <p>{selected.length ? `${selected.length} selected · Matches can come from any of these.` : "Select one or more lists."}</p>
      {["Library shelves", "My lists"].map((heading, i) => {
        const group = options.filter(s => i === 0 ? s.mode === "shelf" : s.mode !== "shelf");
        if (!group.length) return null;
        return <fieldset key={heading} className="list-source-group"><legend>{heading}</legend>{group.map(source =>
          <label key={source.id}>
            <input type="checkbox" value={source.id} checked={selected.includes(source.id)}
              onChange={event => onChange(event.target.checked ? [...selected, source.id] : selected.filter(id => id !== source.id))} />
            <span>{source.name}</span>
          </label>
        )}</fieldset>;
      })}
    </>}
  </fieldset>;
}
