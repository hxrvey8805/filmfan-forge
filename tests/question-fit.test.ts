import { expect, it, vi } from "vitest";
import { questionFit } from "../supabase/functions/_shared/question-fit";
import { noteExcerpt } from "../supabase/functions/_shared/note-excerpt";
const approve = (receipt: string) =>
  vi.fn().mockResolvedValue({ fit: "direct", receipt });
it("does not turn a command after a personal disclosure into a verified reason for the command", async () => {
  const source =
    "The note describes a promise. The dialogue puts it this way: “I am grateful. Pass me the cup.”";
  expect(
    await questionFit(
      "Why ask for the cup?",
      source,
      [],
      approve("I am grateful. Pass me the cup."),
    ),
  ).toBe("context");
  expect(
    await questionFit(
      "Why ask for the cup?",
      source,
      [],
      approve("because of the promise"),
    ),
  ).toBe("unrelated");
});
it("retains an explanation which actually states the reason, with its source wording intact", async () => {
  const source =
    "The problem is the time limit. The dialogue puts it this way: “We need to leave because it closes at noon.”";
  expect(
    await questionFit(
      "Why leave?",
      source,
      [],
      approve("because it closes at noon"),
    ),
  ).toBe("direct");
});
it("quotes original contiguous cues rather than reconstructing an exchange from matched keywords", () => {
  const c = [
    "Read the dial.",
    "Why is the needle red?",
    "Because the tank is nearly empty.",
    "No further instructions.",
  ];
  const v = noteExcerpt(
    "Why is the needle red?",
    { tmdbId: 1, mediaType: "movie", seconds: 30 },
    "The tank is nearly empty.",
    c,
  );
  expect(v).toEqual({ text: c.slice(0, 3).join(" "), ids: ["C1", "C2", "C3"] });
});
