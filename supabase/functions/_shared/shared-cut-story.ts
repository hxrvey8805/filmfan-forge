// Only original summaries of events reviewed in BOTH editions belong here.
// Each completion time is the end of the supporting exchange (not the start of the scene).
import { broadDiscussion } from './exchange-commentary.ts';
import { cutGroup } from './cut-scope.ts';
import { formatTimestamp, questionIntent, type ViewingPosition } from './companion.ts';
import { discussScene } from './scene-discussion.ts';
import type { JsonGenerator } from './answer.ts';
import type { CheckedResponse } from './companion-response.ts';

interface CutFact {
  id: string;
  text: string;
  completed: number[];
  milestone?: boolean;
}
interface CutReview {
  editions: number[];
  facts: CutFact[];
}
const pilot: CutReview = {
  editions: [9499438, 11568378], // WEB-DL and extended Blu-ray, respectively
  facts: [
    {
      id: 'arrival',
      completed: [43.9, 59.017],
      text: 'Eleanor learns that her life on Earth has ended.',
      milestone: true,
    },
    {
      id: 'welcome',
      completed: [180.146, 194.069],
      text: 'Eleanor is told she has made it into the Good Place.',
      milestone: true,
    },
    {
      id: 'admission',
      completed: [333.066, 380.797],
      text:
        'The welcome presentation says actions on Earth carry positive or negative value. Only the very best lives qualify for this neighborhood.',
      milestone: true,
    },
    {
      id: 'soulmates',
      completed: [476.510, 538.329],
      text: 'Chidi Anagonye introduces himself to Eleanor as her soulmate.',
      milestone: true,
    },
    {
      id: 'language',
      completed: [517.579, 580.205],
      text:
        'Eleanor compliments Chidi on his English. He is speaking French: the Good Place lets each person hear a language they understand.',
    },
    {
      id: 'truth',
      completed: [535.701, 597.055],
      text:
        'Chidi has spent his life looking for answers about the universe. He is thrilled that he and Eleanor can now explore those questions together as soulmates.',
    },
    {
      id: 'confides',
      completed: [570.401, 632.590],
      text:
        'After asking Chidi to stand by her, Eleanor tells him the memories are not hers and says she does not belong here.',
      milestone: true,
    },
    {
      id: 'wrong-life',
      completed: [594.686, 658.116],
      text:
        'Eleanor says they got her name right but the rest of her life story wrong. She was not the lawyer who collected clown paintings and rescued orphans.',
    },
    {
      id: 'sales',
      completed: [648.076, 711.336],
      text:
        'Eleanor describes a job selling fake medicine to sick and elderly people, and boasts that she led the sales figures.',
    },
    {
      id: 'tell-michael',
      completed: [663.025, 728.770],
      text:
        'Chidi wonders if telling Michael the truth could be a test that lets Eleanor stay. That is his suggestion, not a guarantee.',
    },
    { id: 'ethics', completed: [751.081, 814.314], text: 'Chidi says he taught ethics and moral philosophy.' },
    {
      id: 'neighbors',
      completed: [774.772, 843.009],
      text: 'Eleanor and Chidi meet their neighbors, Tahani and Jianyu, another pair of soulmates.',
    },
    {
      id: 'chaos',
      completed: [1192.090, 1346.303],
      text:
        'When Tahani asks about a giant ladybug, Michael admits he has no idea what is happening or how to control it.',
      milestone: true,
    },
    {
      id: 'argument',
      completed: [1274.739, 1428.427],
      text:
        'Eleanor questions whether the chaos is her fault. Chidi points to the flying shrimp and giraffes as echoes of how she acted at the party.',
    },
    {
      id: 'choice',
      completed: [1341.739, 1496.787],
      text: 'Eleanor asks Chidi to teach her how to be good so she can earn her place in the neighborhood.',
      milestone: true,
    },
    {
      id: 'meeting',
      completed: [1357.418, 1518.267],
      text:
        'Michael calls an emergency neighborhood meeting. Eleanor presses Chidi for his decision about helping her.',
    },
  ],
};
const reviews = { 'good-place-pilot': pilot };

export function sharedCutFacts(review: CutReview, seconds: number) {
  if (new Set(review.editions).size !== review.editions.length || !Number.isFinite(seconds)) return [];
  return review.facts.filter((f) =>
    review.editions.length >= 2 && f.completed.length === review.editions.length &&
    f.completed.every((t) => Number.isFinite(t) && t >= 0 && t <= seconds)
  )
    .map((f) => ({ ...f, end: Math.max(...f.completed) })).sort((a, b) => a.end - b.end);
}
export async function sharedCutAnswer(
  question: string,
  p: ViewingPosition,
  generate: JsonGenerator,
): Promise<CheckedResponse | null> {
  const group = cutGroup(p);
  if (!group) return null;
  const facts = sharedCutFacts(reviews[group], p.seconds);
  const evidence = (f: typeof facts[number]) => ({
    id: 'shared-cut:' + f.id,
    season: p.seasonNumber!,
    episode: p.episodeNumber!,
    start: f.end,
    end: f.end,
    label: 'Seen in both cuts by ' + formatTimestamp(Math.ceil(f.end)),
  });
  if (!facts.length) {
    return {
      answer: 'I don’t have a shared story detail to confirm at this timestamp yet.',
      limited: true,
      evidence: [],
    };
  }
  if (questionIntent(question) === 'recap') {
    const milestones = facts.filter((f) => f.milestone || f === facts.at(-1));
    return { answer: milestones.map((f) => f.text).join(' '), evidence: milestones.map(evidence) };
  }
  const broad = broadDiscussion(question) || questionIntent(question) === 'scene';
  const recent = facts.slice(-2);
  const sources = facts.map((f) => ({ id: f.id, text: f.text, end: f.end }));
  const discussion = await discussScene({
    ...(broad ? { mode: 'shared-prefix' as const } : {}),
    question,
    seconds: p.seconds,
    sources,
    earlierQuestions: [],
  }, generate);
  if (broad) {
    const cited = discussion && facts.filter((f) => discussion.sourceIds.includes(f.id));
    return {
      answer: 'The cuts differ here. Here’s what both have shown by now. ' +
        (discussion?.answer ?? recent.map((f) => f.text).join(' ')),
      evidence: (cited?.length ? cited : recent).map(evidence),
    };
  }
  if (!discussion) {
    return { answer: 'I can’t confirm that detail in both cuts at this timestamp.', limited: true, evidence: [] };
  }
  return {
    answer: discussion.answer,
    evidence: facts.filter((f) => discussion.sourceIds.includes(f.id)).map(evidence),
    ...(discussion.limited ? { limited: true } : {}),
  };
}
