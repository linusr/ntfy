import * as React from "react";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import InfiniteScroll from "react-infinite-scroll-component";
import { Trans, useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import * as RadixDialog from "@radix-ui/react-dialog";
import {
  BellRing,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsUp,
  Copy,
  ExternalLink,
  Inbox,
  Link2,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Trash2,
  X,
} from "lucide-react";
import {
  copyToClipboard,
  formatBytes,
  formatDateTime,
  maybeActionErrors,
  openUrl,
  shortUrl,
  topicDisplayName,
  topicUrl,
  unmatchedTags,
} from "../app/utils";
import { ACTION_BROADCAST, ACTION_COPY, ACTION_HTTP, ACTION_VIEW } from "../app/actions";
import { formatMessage, formatTitle, isImage } from "../app/notificationUtils";
import subscriptionManager from "../app/SubscriptionManager";
import notifier from "../app/Notifier";
import AttachmentIcon from "./AttachmentIcon";
import { useAutoSubscribe } from "./hooks";
import { usePrefCache } from "./PrefCache";
import Button from "./ui/Button";
import IconButton from "./ui/IconButton";
import Tooltip from "./ui/Tooltip";
import TopicAvatar from "./ui/TopicAvatar";
import { Chip, EmptyState } from "./ui/Primitives";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "./ui/Menu";
import { useToast } from "./ui/Toast";
import cn from "./ui/cn";

// Loaded lazily so the heavy markdown stack only ships when a text/markdown message is shown
const MarkdownContent = lazy(() => import("./MarkdownContent"));

export const AllSubscriptions = () => {
  // allNotifications is preloaded in Layout, so this view has its data on mount (no empty frame on switch)
  const { subscriptions, allNotifications } = useOutletContext();
  if (!subscriptions || allNotifications === null || allNotifications === undefined) {
    return <DeferredLoading />;
  }
  if (subscriptions.length === 0) {
    return <NoSubscriptions />;
  }
  if (allNotifications.length === 0) {
    return <NoNotifications subscription={subscriptions[0]} all />;
  }
  return <NotificationList key="all" notifications={allNotifications} subscriptions={subscriptions} showTopic messageBar={false} />;
};

export const SingleSubscription = () => {
  const { subscriptions, selected, allNotifications } = useOutletContext();
  useAutoSubscribe(subscriptions, selected);
  // Filtered from the preloaded list, so switching topics needs no database read
  const notifications = useMemo(
    () => (selected && allNotifications ? allNotifications.filter((n) => n.subscriptionId === selected.id) : []),
    [allNotifications, selected?.id],
  );
  if (!selected || allNotifications === null || allNotifications === undefined) {
    return <DeferredLoading />;
  }
  if (notifications.length === 0) {
    return <NoNotifications subscription={selected} />;
  }
  return <NotificationList id={selected.id} notifications={notifications} subscriptions={subscriptions} messageBar />;
};

const pageSize = 20;

const NotificationList = ({ id, notifications, subscriptions, showTopic = false, messageBar }) => {
  const { t } = useTranslation();
  const [maxCount, setMaxCount] = useState(pageSize);
  const count = Math.min(notifications.length, maxCount);
  const subscriptionsById = useMemo(() => Object.fromEntries((subscriptions || []).map((s) => [s.id, s])), [subscriptions]);

  useEffect(
    () => () => {
      setMaxCount(pageSize);
      document.getElementById("main")?.scrollTo(0, 0);
    },
    [id],
  );

  return (
    <InfiniteScroll
      dataLength={count}
      next={() => setMaxCount((prev) => prev + pageSize)}
      hasMore={count < notifications.length}
      loader={<Loader2 className="mx-auto my-6 size-5 animate-spin text-muted" />}
      scrollThreshold={0.7}
      scrollableTarget="main"
    >
      <div
        role="list"
        aria-label={t("notifications_list")}
        className={cn("mx-auto w-full max-w-3xl space-y-3 px-3 pt-5 sm:px-6", messageBar ? "pb-28" : "pb-8")}
      >
        {notifications.slice(0, count).map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            subscription={showTopic ? subscriptionsById[notification.subscriptionId] : undefined}
          />
        ))}
      </div>
    </InfiniteScroll>
  );
};

/** "5 min ago" for the last week, the preference-formatted date for older messages. */
const formatRelativeTime = (timestamp, fallback) => {
  const seconds = Math.round(timestamp - Date.now() / 1000);
  const abs = Math.abs(seconds);
  if (abs >= 7 * 86400) {
    return fallback;
  }
  const rtf = new Intl.RelativeTimeFormat(document.documentElement.lang || undefined, { numeric: "auto", style: "short" });
  if (abs < 60) return rtf.format(0, "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  return rtf.format(Math.round(seconds / 86400), "day");
};

const priorityStyles = {
  1: { icon: ChevronDown, className: "text-muted", label: "publish_dialog_priority_min" },
  2: { icon: ChevronDown, className: "text-muted", label: "publish_dialog_priority_low" },
  4: { icon: ChevronUp, className: "text-warning", label: "publish_dialog_priority_high" },
  5: { icon: ChevronsUp, className: "text-danger", label: "publish_dialog_priority_max" },
};

const PriorityBadge = ({ priority }) => {
  const { t } = useTranslation();
  const style = priorityStyles[priority];
  if (!style) return null;
  const Icon = style.icon;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold", style.className)} title={t(style.label)}>
      <Icon className="size-3.5" aria-label={t("notifications_priority_x", { priority })} />
      {priority >= 4 && t(style.label)}
    </span>
  );
};

const NotificationItem = ({ notification, subscription }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const { dateFormat, timeFormat } = usePrefCache();
  const { attachment } = notification;
  const date = formatDateTime(notification.time, dateFormat, timeFormat);
  const tags = unmatchedTags(notification.tags);
  const expired = attachment?.expires && attachment.expires < Date.now() / 1000;
  const unread = notification.new === 1;
  const stripe = { 4: "bg-warning", 5: "bg-danger" }[notification.priority];

  const copy = async (text) => {
    await copyToClipboard(text);
    toast(t("notifications_copied_to_clipboard"));
  };

  return (
    <article
      role="listitem"
      aria-label={t("notifications_list_item")}
      className="group relative overflow-hidden rounded-2xl border border-border bg-surface transition-shadow hover:shadow-[0_4px_16px_rgb(15_23_42/0.06)] dark:hover:shadow-[0_4px_16px_rgb(0_0_0/0.35)]"
    >
      {stripe && <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", stripe)} />}
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              {unread && <span className="size-2 rounded-full bg-accent" aria-label={t("notifications_new_indicator")} />}
              {subscription && (
                <span className="inline-flex items-center gap-1.5 font-medium text-text">
                  <TopicAvatar name={topicDisplayName(subscription)} size={18} />
                  {topicDisplayName(subscription)}
                </span>
              )}
              <Tooltip content={date}>
                <time dateTime={new Date(notification.time * 1000).toISOString()}>{formatRelativeTime(notification.time, date)}</time>
              </Tooltip>
              <PriorityBadge priority={notification.priority} />
            </div>
            {notification.title && <h3 className="mt-1.5 text-[15px] font-semibold leading-snug">{formatTitle(notification)}</h3>}
            <div className={cn("break-words text-[15px] leading-relaxed", notification.title ? "mt-1" : "mt-1.5")}>
              <NotificationBody notification={notification} />
              {maybeActionErrors(notification)}
            </div>
          </div>
          <div className="-mr-1.5 -mt-1 flex shrink-0 items-center opacity-100 transition-opacity sm:opacity-60 sm:group-hover:opacity-100">
            {unread && (
              <IconButton
                size="sm"
                label={t("notifications_mark_read")}
                onClick={() => subscriptionManager.markNotificationRead(notification.id)}
              >
                <Check className="size-4" />
              </IconButton>
            )}
            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t("action_bar_toggle_action_menu")}
                  className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </MenuTrigger>
              <MenuContent>
                {notification.message && (
                  <MenuItem icon={Copy} onSelect={() => copy(formatMessage(notification))}>
                    {t("common_copy_to_clipboard")}
                  </MenuItem>
                )}
                {notification.click && (
                  <>
                    <MenuItem icon={ExternalLink} onSelect={() => openUrl(notification.click)}>
                      {t("notifications_click_open_button")}
                    </MenuItem>
                    <MenuItem icon={Link2} onSelect={() => copy(notification.click)}>
                      {t("notifications_click_copy_url_button")}
                    </MenuItem>
                  </>
                )}
                {attachment && !expired && (
                  <>
                    <MenuItem icon={Paperclip} onSelect={() => openUrl(attachment.url)}>
                      {t("notifications_attachment_open_button")}
                    </MenuItem>
                    <MenuItem icon={Link2} onSelect={() => copy(attachment.url)}>
                      {t("notifications_attachment_copy_url_button")}
                    </MenuItem>
                  </>
                )}
                {(notification.message || notification.click || (attachment && !expired)) && <MenuSeparator />}
                <MenuItem icon={Trash2} danger onSelect={() => subscriptionManager.deleteNotification(notification.id)}>
                  {t("notifications_delete")}
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </div>

        {attachment && <Attachment attachment={attachment} />}

        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label={t("notifications_tags")}>
            {tags.map((tag) => (
              <Chip key={tag}>{tag}</Chip>
            ))}
          </div>
        )}

        {notification.actions?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {notification.actions.map((action) => (
              <UserAction
                key={action.id}
                notification={notification}
                action={action}
                onCopied={() => toast(t("notifications_copied_to_clipboard"))}
              />
            ))}
          </div>
        )}
      </div>
    </article>
  );
};

/** Plain text with URLs turned into links; markdown messages render through MarkdownContent. */
const NotificationBody = ({ notification }) => {
  const formatted = formatMessage(notification);
  if (notification.content_type === "text/markdown") {
    return (
      <Suspense fallback={null}>
        <MarkdownContent content={formatted} />
      </Suspense>
    );
  }
  const parts = formatted.split(/(\bhttps?:\/\/[-A-Z0-9+&’@#/%?=()~_|!:,.;]*[-A-Z0-9+&@#/%=~()_|]\b)/gi);
  return (
    <span className="whitespace-pre-line">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          // eslint-disable-next-line react/no-array-index-key
          <a key={i} href={part} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
            {shortUrl(part)}
          </a>
        ) : (
          part
        ),
      )}
    </span>
  );
};

const Attachment = ({ attachment }) => {
  const { t } = useTranslation();
  const { dateFormat, timeFormat } = usePrefCache();
  const now = Date.now() / 1000;
  const expired = attachment.expires && attachment.expires < now;

  if (!expired && isImage(attachment)) {
    return <ImageAttachment attachment={attachment} />;
  }

  const details = [];
  if (attachment.size) details.push(formatBytes(attachment.size));
  if (attachment.expires && !expired) {
    details.push(t("notifications_attachment_link_expires", { date: formatDateTime(attachment.expires, dateFormat, timeFormat) }));
  }
  if (expired) details.push(t("notifications_attachment_link_expired"));

  const content = (
    <>
      <AttachmentIcon type={attachment.type} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{attachment.name}</span>
        {details.length > 0 && <span className="block truncate text-xs text-muted">{details.join(" · ")}</span>}
      </span>
    </>
  );

  return expired ? (
    <div className="mt-3 flex items-center gap-3 rounded-xl border border-border p-2.5 opacity-70">{content}</div>
  ) : (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 flex items-center gap-3 rounded-xl border border-border p-2.5 transition-colors hover:bg-surface-2"
    >
      {content}
    </a>
  );
};

const ImageAttachment = ({ attachment }) => {
  const { t } = useTranslation();
  return (
    <RadixDialog.Root>
      <RadixDialog.Trigger asChild>
        <button
          type="button"
          className="mt-3 block w-full overflow-hidden rounded-xl border border-border"
          aria-label={t("notifications_attachment_image")}
        >
          <img src={attachment.url} loading="lazy" alt={t("notifications_attachment_image")} className="max-h-96 w-full object-cover" />
        </button>
      </RadixDialog.Trigger>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/85" />
        <RadixDialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-6 outline-none">
          <RadixDialog.Title className="sr-only">{attachment.name}</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">{t("notifications_attachment_image")}</RadixDialog.Description>
          <img src={attachment.url} alt={t("notifications_attachment_image")} className="max-h-full max-w-full rounded-lg object-contain" />
          <RadixDialog.Close
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label={t("common_close")}
          >
            <X className="size-5" />
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
};

const ACTION_PROGRESS_ONGOING = 1;
const ACTION_PROGRESS_SUCCESS = 2;
const ACTION_PROGRESS_FAILED = 3;

const ACTION_LABEL_SUFFIX = {
  [ACTION_PROGRESS_ONGOING]: " …",
  [ACTION_PROGRESS_SUCCESS]: " ✔",
  [ACTION_PROGRESS_FAILED]: " ❌",
};

const updateActionStatus = (notification, action, progress, error) => {
  subscriptionManager.updateNotification({
    ...notification,
    actions: notification.actions.map((a) => (a.id === action.id ? { ...a, progress, error } : a)),
  });
};

const clearNotification = async (notification) => {
  const subscription = await subscriptionManager.get(notification.subscriptionId);
  if (subscription) {
    await notifier.cancel(subscription, notification);
  }
  await subscriptionManager.markNotificationRead(notification.id);
};

const performHttpAction = async (notification, action) => {
  try {
    updateActionStatus(notification, action, ACTION_PROGRESS_ONGOING, null);
    const response = await fetch(action.url, {
      method: action.method ?? "POST",
      headers: action.headers ?? {},
      // Must stay nullish when unset, or fetch rejects GET requests for "having a body"
      body: action.body,
    });
    if (response.status >= 200 && response.status <= 299) {
      updateActionStatus(notification, action, ACTION_PROGRESS_SUCCESS, null);
      if (action.clear) {
        await clearNotification(notification);
      }
    } else {
      updateActionStatus(notification, action, ACTION_PROGRESS_FAILED, `${action.label}: Unexpected response HTTP ${response.status}`);
    }
  } catch (e) {
    console.log(`[Notifications] HTTP action failed`, e);
    updateActionStatus(notification, action, ACTION_PROGRESS_FAILED, `${action.label}: ${e} Check developer console for details.`);
  }
};

const UserAction = ({ notification, action, onCopied }) => {
  const { t } = useTranslation();
  if (action.action === ACTION_BROADCAST) {
    return (
      <Tooltip content={t("notifications_actions_not_supported")}>
        <span>
          <Button size="sm" variant="secondary" disabled>
            {action.label}
          </Button>
        </span>
      </Tooltip>
    );
  }
  if (action.action === ACTION_VIEW) {
    return (
      <Tooltip content={t("notifications_actions_open_url_title", { url: action.url })}>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            openUrl(action.url);
            if (action.clear) clearNotification(notification);
          }}
        >
          <ExternalLink className="size-3.5" />
          {action.label}
        </Button>
      </Tooltip>
    );
  }
  if (action.action === ACTION_HTTP) {
    const method = action.method ?? "POST";
    return (
      <Tooltip content={t("notifications_actions_http_request_title", { method, url: action.url })}>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => performHttpAction(notification, action)}
          disabled={action.progress === ACTION_PROGRESS_ONGOING}
        >
          {action.label + (ACTION_LABEL_SUFFIX[action.progress ?? 0] ?? "")}
        </Button>
      </Tooltip>
    );
  }
  if (action.action === ACTION_COPY) {
    return (
      <Button
        size="sm"
        variant="secondary"
        onClick={async () => {
          await copyToClipboard(action.value);
          onCopied();
          if (action.clear) await clearNotification(notification);
        }}
      >
        <Copy className="size-3.5" />
        {action.label}
      </Button>
    );
  }
  return null;
};

const CurlExample = ({ url }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const command = `curl -d "Hi" ${url}`;
  return (
    <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-left">
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-text">{command}</code>
      <IconButton
        size="sm"
        label={t("common_copy_to_clipboard")}
        onClick={async () => {
          await copyToClipboard(command);
          toast(t("notifications_copied_to_clipboard"));
        }}
      >
        <Copy className="size-4" />
      </IconButton>
    </div>
  );
};

const ForMoreDetails = () => (
  <Trans
    i18nKey="notifications_more_details"
    components={{
      // eslint-disable-next-line jsx-a11y/anchor-has-content, jsx-a11y/control-has-associated-label
      websiteLink: <a className="text-accent hover:underline" href="https://ntfy.sh" target="_blank" rel="noopener noreferrer" />,
      // eslint-disable-next-line jsx-a11y/anchor-has-content, jsx-a11y/control-has-associated-label
      docsLink: <a className="text-accent hover:underline" href="/docs" target="_blank" rel="noopener noreferrer" />,
    }}
  />
);

const NoNotifications = ({ subscription, all = false }) => {
  const { t } = useTranslation();
  return (
    <EmptyState icon={BellRing} title={t(all ? "notifications_none_for_any_title" : "notifications_none_for_topic_title")}>
      <p>{t(all ? "notifications_none_for_any_description" : "notifications_none_for_topic_description")}</p>
      <CurlExample url={topicUrl(subscription.baseUrl, subscription.topic)} />
      <p className="mt-4">
        <ForMoreDetails />
      </p>
    </EmptyState>
  );
};

const NoSubscriptions = () => {
  const { t } = useTranslation();
  return (
    <EmptyState icon={Inbox} title={t("notifications_no_subscriptions_title")}>
      <p>{t("notifications_no_subscriptions_description", { linktext: t("nav_button_subscribe") })}</p>
      <p className="mt-4">
        <ForMoreDetails />
      </p>
    </EmptyState>
  );
};

// Nothing renders until a load takes at least `delayMs`, so fast IndexedDB reads never flash a spinner
const DeferredLoading = ({ delayMs = 250 }) => {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  if (!show) return null;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted">
      <Loader2 className="size-7 animate-spin text-accent" />
      <p className="text-sm">{t("notifications_loading")}</p>
    </div>
  );
};
