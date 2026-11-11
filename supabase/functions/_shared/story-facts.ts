// Reviewed story facts, never canned answers. These episode-level sources are
// available only AFTER the whole source episode. They cannot establish an exact
// current scene, an arrival time, or events from subsequent episodes.
export interface StoryFact {
  id: string;
  tmdbId: number;
  through: { season: number; episode: number };
  text: string;
  entities: { name: string; aliases: string[] }[];
  reviewedAt: string;
  references: { url: string; locator: string }[];
}

export const storyFacts: StoryFact[] = [{
  id: 'dark-katharina-search-s2-v1', tmdbId: 70523,
  through: { season: 2, episode: 8 },
  text: 'By the end of season 2, Katharina has learned that her missing son Mikkel is in the past. An old school photograph helps convince her that time travel is real. She wants to recover Mikkel and asks adult Jonas how to bring him back. She searches the caves and enters their passage in the season finale. These facts explain the purpose of her search; they do not establish where or when she arrives after entering the passage.',
  entities: [{ name: 'Katharina', aliases: ['Caterina', 'Catarina', 'Katarina'] }, { name: 'Mikkel', aliases: [] }],
  reviewedAt: '2026-11-08',
  references: [
    { url: 'https://www.tvguide.com/news/dark-season-2-explained-netflix/', locator: 'Katharina checks the school photograph and becomes determined to rescue Mikkel; finale passage entry.' },
    { url: 'https://metawitches.com/2019/08/30/dark-season-2-episode-8-endings-and-beginnings-recap/', locator: 'Recap: Katharina examines the album and asks adult Jonas how she can get Mikkel back. Commentary and theories are excluded.' },
  ],
}];
