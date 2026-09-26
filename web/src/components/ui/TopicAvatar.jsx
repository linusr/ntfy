import * as React from "react";

const hues = [217, 199, 174, 262, 291, 330, 12, 32, 45, 142];

/** Stable color per topic, so the same topic looks the same across sessions and devices. */
const hueFor = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 2147483647;
  }
  return hues[hash % hues.length];
};

const TopicAvatar = ({ name, size = 28 }) => {
  const hue = hueFor(name);
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "#";
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 select-none items-center justify-center font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.46,
        borderRadius: Math.round(size * 0.3),
        background: `linear-gradient(145deg, hsl(${hue} 70% 55%), hsl(${hue} 72% 42%))`,
      }}
    >
      {initial}
    </span>
  );
};

export default TopicAvatar;
