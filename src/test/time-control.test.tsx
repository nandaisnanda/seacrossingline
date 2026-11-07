import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AboutData, TimeControl } from "@/components/atlas/atlas-controls";
import { atlasCopy } from "@/components/atlas/atlas-i18n";

it("tells the reader that closing years are incomplete, in both languages", () => {
  for (const language of ["id", "en"] as const) {
    const t = atlasCopy[language];
    const { unmount } = render(
      <TimeControl
        year={1941}
        onChange={vi.fn()}
        playing={false}
        onPlay={vi.fn()}
        language={language}
        t={t}
      />,
    );
    expect(screen.getByText(t.closedYearCaption)).toBeTruthy();
    unmount();
  }
});

it("closes the about dialog on Escape", () => {
  const onClose = vi.fn();
  render(
    <AboutData open onClose={onClose} sources={[]} showColonialNote={false} t={atlasCopy.id} />,
  );
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  expect(onClose).toHaveBeenCalledOnce();
});
