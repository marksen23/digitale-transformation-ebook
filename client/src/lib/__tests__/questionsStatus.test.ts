import { describe, it, expect } from "vitest";
import {
  questionStatus, questionCounts, matchesQuestionFilter, QUESTION_STATUS_LABEL,
} from "../questions";

describe("Fragen-Status: Anschlussfragen sind nicht „offen“", () => {
  const open = { answered: false };
  const followUp = { answered: false, followUp: true };
  const answeredFollowUp = { answered: true, followUp: true };
  const answered = { answered: true, followUp: false };

  it("questionStatus unterscheidet offen, Anschlussfrage, beantwortet", () => {
    expect(questionStatus(open)).toBe("open");
    expect(questionStatus(followUp)).toBe("followUp");
    expect(questionStatus(answeredFollowUp)).toBe("answered");
    expect(questionStatus(answered)).toBe("answered");
    expect(QUESTION_STATUS_LABEL[questionStatus(followUp)]).toBe("Anschlussfrage");
  });

  it("questionCounts zählt Anschlussfragen getrennt (alte Zählung: !answered = offen)", () => {
    const c = questionCounts([open, followUp, followUp, answeredFollowUp, answered]);
    expect(c).toEqual({ total: 5, answered: 2, open: 1, followUp: 2 });
    expect(c.answered + c.open + c.followUp).toBe(c.total);
  });

  it("ältere JSONs ohne followUp zählen wie bisher", () => {
    expect(questionCounts([{ answered: false }, { answered: true }])).toEqual({ total: 2, answered: 1, open: 1, followUp: 0 });
  });

  it("Filter „offen“ blendet Anschlussfragen aus, Filter „followUp“ zeigt nur sie", () => {
    const all = [open, followUp, answered];
    expect(all.filter(q => matchesQuestionFilter(q, "open"))).toEqual([open]);
    expect(all.filter(q => matchesQuestionFilter(q, "followUp"))).toEqual([followUp]);
    expect(all.filter(q => matchesQuestionFilter(q, "all"))).toHaveLength(3);
  });
});
