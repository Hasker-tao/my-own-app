import { describe, expect, it } from "vitest";
import { planOccursOn } from "../../src/pages/FitnessPage";

describe("recurring fitness plans", () => {
  it("starts on the selected weekday and repeats by week interval", () => {
    const plan = { weekday: 1, starts_on: "2026-09-14", repeat_weeks: 2 };
    expect(planOccursOn(plan, "2026-09-14")).toBe(true);
    expect(planOccursOn(plan, "2026-09-21")).toBe(false);
    expect(planOccursOn(plan, "2026-09-28")).toBe(true);
    expect(planOccursOn(plan, "2026-09-13")).toBe(false);
    expect(planOccursOn({ weekday: 1 }, "2026-09-14")).toBe(false);
  });
});
