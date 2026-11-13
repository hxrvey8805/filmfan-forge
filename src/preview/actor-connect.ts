// A connected set of cast credits for the local phone preview.
const actors = [
  { id: 1, name: "Andrew Garfield", profilePath: "/5ydZ6TluPtxlz5G8nlWMB7SGmow.jpg" },
  { id: 2, name: "Jesse Eisenberg", profilePath: "/2ojZrkt5rdkUi857WSeCatxXdGS.jpg" },
  { id: 3, name: "Emma Stone", profilePath: "/ak2Y9wOI3wi2pNQU6OWSvVvWPj5.jpg" },
  { id: 4, name: "Jonah Hill", profilePath: "/cymlWttB83MsAGR2EkTgANtjeRH.jpg" },
];
const titles = [
  { id: 1, type: "movie", title: "The Social Network", year: 2010, cast: [2, 1], roles: ["Mark Zuckerberg", "Eduardo Saverin"] },
  { id: 2, type: "movie", title: "The Amazing Spider-Man", year: 2012, cast: [1, 3], roles: ["Peter Parker", "Gwen Stacy"] },
  { id: 3, type: "movie", title: "Zombieland", year: 2009, cast: [2, 3], roles: ["Columbus", "Wichita"] },
  { id: 4, type: "tv", title: "Maniac", year: 2018, cast: [3, 4], roles: ["Annie Landsberg", "Owen Milgrim"] },
  { id: 5, type: "movie", title: "Superbad", year: 2007, cast: [4, 3], roles: ["Seth", "Jules"] },
];
const pairs = [[1, 4], [4, 2], [2, 1], [3, 4]];
let round = 0;

function actor(id: number) {
  return actors.find(person => person.id === id)!;
}

export function previewActorConnect(body: Record<string, unknown>) {
  switch (body.action) {
    case "getRandomActors": {
      const pair = pairs[round++ % pairs.length];
      return { actors: pair.map(actor) };
    }
    case "getActorFilmography":
      return { credits: titles.filter(title => title.cast.includes(Number(body.actorId)))
        .map(({ id, type, title, year }) => ({ id, type, title, year, posterPath: "" })) };
    case "getMovieCast":
    case "getTVCast": {
      const type = body.action === "getMovieCast" ? "movie" : "tv";
      const title = titles.find(item => item.type === type && item.id === (body.movieId ?? body.tvId));
      return { castVersion: 2, cast: title?.cast.map((id, order) => ({ ...actor(id), order, character: title.roles[order] })) ?? [] };
    }
    default:
      return null;
  }
}
