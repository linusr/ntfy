import * as React from "react";
import { Avatar } from "@mui/material";

const hues = [174, 199, 221, 262, 291, 330, 12, 32, 45, 142];

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
    <Avatar
      variant="rounded"
      aria-hidden
      sx={{
        width: size,
        height: size,
        fontSize: size * 0.46,
        fontWeight: 700,
        borderRadius: `${Math.round(size * 0.3)}px`,
        color: "#fff",
        background: `linear-gradient(145deg, hsl(${hue} 70% 52%), hsl(${hue} 72% 40%))`,
      }}
    >
      {initial}
    </Avatar>
  );
};

export default TopicAvatar;
