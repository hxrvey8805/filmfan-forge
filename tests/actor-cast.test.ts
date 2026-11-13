import { describe, expect, it } from "vitest";
import { titleCast, type GameCastMember } from "../supabase/functions/_shared/actor-cast";
import { orderedGameCast } from "../src/lib/game-cast";

describe("Actor Connect cast billing", () => {
  it("keeps the first-billed actor selectable without a photo and merges duplicate credits", () => {
    const cast = titleCast([
      { id: 2, name: "Second", order: 1, profile_path: "/second.jpg" },
      { id: 1, name: "First", order: 8, character: "Another role" },
      { id: 3, name: "Unranked", order: null },
      { id: 1, name: "First", order: 0, character: "Lead" },
    ]);
    expect(cast.map(person => person.id)).toEqual([1, 2, 3]);
    expect(cast[0]).toMatchObject({ order: 0, profilePath: "", character: "Lead / Another role" });
  });

  it("uses series billing ahead of episode totals, then breaks ties with total appearances", () => {
    const cast = titleCast([
      { id: 2, name: "Second", order: 1, total_episode_count: 8, roles: [{ character: "Guest", episode_count: 8 }] },
      { id: 3, name: "Regular", order: 1, total_episode_count: 10, roles: [
        { character: "Minor", episode_count: 3 }, { character: "Usual role", episode_count: 7 },
      ] },
      { id: 1, name: "Lead", order: 0, total_episode_count: 6 },
    ]);
    expect(cast.map(person => person.id)).toEqual([1, 3, 2]);
    expect(cast[1].character).toBe("Usual role / Minor");
  });

  it("repairs the old movie order without promoting conflicting or explicitly ranked credits", () => {
    const person = (id: number, order: number): GameCastMember => ({ id, order, name: String(id), profilePath: "", character: "" });
    const old = [person(2, 1), person(3, 2), person(1, 999)];
    expect(orderedGameCast(old, "movie").map(p => p.id)).toEqual([1, 2, 3]);
    expect(orderedGameCast([...old, person(4, 999)], "movie")[0].id).toBe(2);
    expect(orderedGameCast(old, "movie", 2)[0].id).toBe(2);
    expect(orderedGameCast(old, "tv")[0].id).toBe(2);
    expect(orderedGameCast([person(5, 0), ...old], "movie")[0].id).toBe(5);
  });
});
