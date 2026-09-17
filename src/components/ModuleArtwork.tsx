import { classNames } from "../utils";

export const moduleArtworkSources = {
  learning: "/assets/brand/learning.svg",
  dashboard: "/assets/module-icons/dashboard-v1.webp",
  media: "/assets/module-icons/media-v1.webp",
  development: "/assets/module-icons/development-v1.webp",
  consulting: "/assets/module-icons/consulting-v1.webp",
  fitness: "/assets/module-icons/fitness-v1.webp",
  diet: "/assets/module-icons/diet-v1.webp",
  entertainment: "/assets/module-icons/entertainment-v1.webp",
  settings: "/assets/module-icons/settings-v1.webp",
} as const;

export type ModuleArtworkName = keyof typeof moduleArtworkSources;

export function ModuleArtwork({ module, label, className, loading = "eager" }: {
  module: ModuleArtworkName;
  label?: string;
  className?: string;
  loading?: "eager" | "lazy";
}) {
  return (
    <img
      className={classNames("module-artwork", className)}
      data-module={module}
      src={moduleArtworkSources[module]}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      draggable={false}
      decoding="async"
      loading={loading}
    />
  );
}
