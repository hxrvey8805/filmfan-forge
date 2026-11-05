import { expect, it, vi } from "vitest";
import { captionCards } from "../supabase/functions/_shared/caption-cards";
import {
  CAPTION_WRITER_MODEL,
  openRouterGenerator,
} from "../supabase/functions/_shared/openrouter";
import {
  storySpeechIssue,
  unsupportedFrame,
} from "../supabase/functions/_shared/story-speech-grounding";
const packets = JSON.stringify({
  question: "What are they discussing?",
  position: { seconds: 23 },
  intent: "discussion",
  earlierQuestions: [],
  currentPassageId: "P2",
  evidence: [
    {
      id: "P1",
      end: 12,
      lines: [["P1:1", 1, null, "Coffee?"], [
        "P1:7",
        10,
        null,
        "Can you trace the letter?",
      ], ["P1:8", 12, null, "No, because there is no address."]],
    },
    {
      id: "P2",
      end: 23,
      lines: [["P2:2", 21, null, "A second letter?"], [
        "P2:3",
        23,
        null,
        "That one has an address.",
      ]],
    },
  ],
});
it("sends one continuous excerpt per writer request, preserving position and isolating the citations", async () => {
  const request = vi.fn<typeof fetch>().mockImplementation(
    async (_url, opts) => {
      const body = JSON.parse(opts!.body as string),
        data = JSON.parse(body.messages[1].content);
      expect(body.model).toBe(CAPTION_WRITER_MODEL);
      expect(body.provider).toMatchObject({
        only: ["nvidia"],
        allow_fallbacks: false,
        max_price: { prompt: 0, completion: 0, request: 0 },
      });
      expect(data.position.seconds).toBe(23);
      expect(data.evidence).toHaveLength(1);
      const answer = data.evidence[0].id === "P1"
        ? {
          anchor: "trace the letter",
          detail: "no address",
          kind: "problem",
          rest: "without an address the letter cannot be traced.",
        }
        : {
          anchor: "trace the letter",
          detail: "second letter",
          kind: "problem",
          rest: "this claim borrows an anchor from the earlier excerpt.",
        };
      return Response.json({
        choices: [{
          finish_reason: "stop",
          message: { content: JSON.stringify(answer) },
        }],
      });
    },
  );
  const result = await openRouterGenerator("dummy", request)(
    "",
    packets,
    400,
    "writer",
    {
      type: "json_schema",
      json_schema: {
        name: "companion_caption_paragraphs",
        strict: true,
        schema: {},
      },
    },
  );
  expect(request).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(request.mock.calls)).not.toContain("Coffee?");
  expect(result).toEqual({
    points: [{
      beat:
        "The problem is that without an address the letter cannot be traced.",
      lineIds: ["P1:7", "P1:8"],
    }],
  });
});
it("does not invent quotes or accept an anchor stitched across caption lines", async () => {
  const f = vi.fn().mockResolvedValue({
    anchor: "the letter no",
    detail: "trace",
    kind: "claim",
    rest: "invented",
  });
  expect(await captionCards(packets, f)).toEqual({ points: [] });
});
it("checks competing meanings against the wording and does not turn their order into a cause", () => {
  const proof =
    "He says it means peace.\n- What do you say it means? - A gift of shells.\nTake your coat.";
  expect(
    unsupportedFrame(
      "The translation turns peace into a demand for a coat.",
      proof,
    ),
  ).toBe(true);
  expect(
    unsupportedFrame(
      "There are two meanings on offer: peace and a gift of shells.",
      proof,
    ),
  ).toBe(false);
  expect(
    unsupportedFrame("Peace comes up, which is why the coat is needed.", proof),
  ).toBe(true);
  expect(
    storySpeechIssue(
      "The same voice says to take the coat.",
      "statement",
      proof.split("\n"),
    ),
  ).toBe("speaker");
});
