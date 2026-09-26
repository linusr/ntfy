import * as React from "react";
import { useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { splitNoEmpty } from "../app/utils";
import { rawEmojis } from "../app/emojis";

// Desktop Chrome on older Linux renders only up to Emoji 11, so newer emojis are hidden there.
const emojisByCategory = {};
const isDesktopChrome = /Chrome/.test(navigator.userAgent) && !/Mobile/.test(navigator.userAgent);
const maxSupportedVersionForDesktopChrome = 11;
rawEmojis.forEach((emoji) => {
  if (!emojisByCategory[emoji.category]) {
    emojisByCategory[emoji.category] = [];
  }
  try {
    const unicodeVersion = parseFloat(emoji.unicode_version);
    const supportedEmoji = unicodeVersion <= maxSupportedVersionForDesktopChrome || !isDesktopChrome;
    if (supportedEmoji) {
      const searchBase = `${emoji.description.toLowerCase()} ${emoji.aliases.join(" ")} ${emoji.tags.join(" ")}`;
      emojisByCategory[emoji.category].push({ ...emoji, searchBase });
    }
  } catch (e) {
    // Malformed entries are skipped
  }
});

const emojiMatches = (emoji, words) => words.length === 0 || words.some((word) => emoji.searchBase.includes(word));

/** Search box and emoji grid, rendered inside the publish dialog's popover. Picking passes the emoji's first alias. */
const EmojiPicker = ({ onEmojiPick }) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const searchRef = useRef(null);
  const searchFields = splitNoEmpty(search.toLowerCase(), " ");

  return (
    <>
      <div className="relative border-b border-border p-2">
        <Search className="pointer-events-none absolute left-4.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          ref={searchRef}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          role="searchbox"
          aria-label={t("emoji_picker_search_placeholder")}
          placeholder={t("emoji_picker_search_placeholder")}
          value={search}
          onChange={(ev) => setSearch(ev.target.value)}
          className="h-9 w-full rounded-lg bg-surface-2 pl-8 pr-8 text-sm placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent-soft"
        />
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              searchRef.current?.focus();
            }}
            aria-label={t("emoji_picker_search_clear")}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-text"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <div className="overflow-y-auto p-2">
        {Object.keys(emojisByCategory).map((category) => (
          <Category key={category} title={category} emojis={emojisByCategory[category]} search={searchFields} onPick={onEmojiPick} />
        ))}
      </div>
    </>
  );
};

const Category = ({ title, emojis, search, onPick }) => {
  const matching = emojis.filter((emoji) => emojiMatches(emoji, search));
  if (matching.length === 0) {
    return null;
  }
  return (
    <div className="mb-2">
      {search.length === 0 && <p className="px-1 pb-1 pt-2 text-xs font-medium text-muted">{title}</p>}
      <div className="grid grid-cols-8">
        {matching.map((emoji) => {
          const label = `${emoji.description} (${emoji.aliases[0]})`;
          return (
            <Popover.Close asChild key={emoji.aliases[0]}>
              <button
                type="button"
                title={label}
                aria-label={label}
                onClick={() => onPick(emoji.aliases[0])}
                className="flex aspect-square items-center justify-center rounded-lg text-2xl hover:bg-surface-2"
              >
                {emoji.emoji}
              </button>
            </Popover.Close>
          );
        })}
      </div>
    </div>
  );
};

export default EmojiPicker;
