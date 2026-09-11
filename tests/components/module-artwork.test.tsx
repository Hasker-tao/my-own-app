import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModuleArtwork, moduleArtworkSources } from "../../src/components/ModuleArtwork";

describe("AI-generated module artwork", () => {
  it("provides one unique local asset for every application module", () => {
    const sources = Object.values(moduleArtworkSources);
    expect(sources).toHaveLength(10);
    expect(new Set(sources).size).toBe(10);
    for (const source of sources.filter(source => !source.endsWith(".svg"))) expect(source).toMatch(/^\/assets\/module-icons\/.+-v1\.webp$/);
  });

  it("is decorative beside visible text and can carry an accessible label when used alone", () => {
    const { container, rerender } = render(<ModuleArtwork module="fitness" />);
    const decorative = container.querySelector("img.module-artwork");
    expect(decorative).toHaveAttribute("alt", "");
    expect(decorative).toHaveAttribute("aria-hidden", "true");
    expect(decorative).toHaveAttribute("src", moduleArtworkSources.fitness);

    rerender(<ModuleArtwork module="settings" label="数据与设置" />);
    expect(screen.getByRole("img", { name: "数据与设置" })).toHaveAttribute("src", moduleArtworkSources.settings);
  });
});
