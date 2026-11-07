import { describe, expect, it } from "vitest";
import { trimLine } from "./draw-on";
import { niceStep, ticksBetween } from "./graticule";

describe("trimLine", () => {
  const line: [number, number][] = [
    [0, 0],
    [2, 0],
    [2, 2],
  ];
  it("returns the whole line at 1 and nothing at 0", () => {
    expect(trimLine(line, 1)).toEqual(line);
    expect(trimLine(line, 0)).toEqual([]);
  });
  it("cuts inside a segment", () => {
    expect(trimLine(line, 0.25)).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(trimLine(line, 0.75)).toEqual([
      [0, 0],
      [2, 0],
      [2, 1],
    ]);
  });
});

describe("graticule helpers", () => {
  it("lists whole-degree ticks inside a range", () => {
    expect(ticksBetween(105.4, 109.2, 1)).toEqual([106, 107, 108, 109]);
  });
  it("widens the step when the map is zoomed out", () => {
    expect(niceStep(0.02, 50)).toBe(1);
    expect(niceStep(0.1, 50)).toBe(5);
  });
});
