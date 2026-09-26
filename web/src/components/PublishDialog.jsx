import * as React from "react";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as Popover from "@radix-ui/react-popover";
import { Clock, Globe, Link2, Mail, Paperclip, Plus, Smile, Upload, X } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { formatBytes, maybeWithAuth, topicShortUrl, topicUrl, validTopic, validUrl } from "../app/utils";
import { imageRegex } from "../app/notificationUtils";
import AttachmentIcon from "./AttachmentIcon";
import api from "../app/Api";
import userManager from "../app/UserManager";
import session from "../app/Session";
import routes from "./routes";
import accountApi from "../app/AccountApi";
import { UnauthorizedError } from "../app/errors";
import { Dialog, DialogContent } from "./ui/Dialog";
import { Field, Input, Textarea } from "./ui/Field";
import Button from "./ui/Button";
import IconButton from "./ui/IconButton";
import { Spinner } from "./ui/Primitives";
import cn from "./ui/cn";

// Loaded lazily so the emoji dataset (~300 KB) is only fetched when the picker is opened.
const EmojiPicker = lazy(() => import("./EmojiPicker"));

const PublishDialog = (props) => {
  const { t } = useTranslation();
  const [baseUrl, setBaseUrl] = useState("");
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  const [messageFocused, setMessageFocused] = useState(true);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [priority, setPriority] = useState(3);
  const [clickUrl, setClickUrl] = useState("");
  const [attachUrl, setAttachUrl] = useState("");
  const [attachFile, setAttachFile] = useState(null);
  const [filename, setFilename] = useState("");
  const [filenameEdited, setFilenameEdited] = useState(false);
  const [email, setEmail] = useState("");
  const [delay, setDelay] = useState("");
  const [publishAnother, setPublishAnother] = useState(false);
  const [markdownEnabled, setMarkdownEnabled] = useState(false);

  const [showTopicUrl, setShowTopicUrl] = useState("");
  const [showClickUrl, setShowClickUrl] = useState(false);
  const [showAttachUrl, setShowAttachUrl] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [showDelay, setShowDelay] = useState(false);

  const showAttachFile = !!attachFile && !showAttachUrl;
  const attachFileInput = useRef();
  const [attachFileError, setAttachFileError] = useState("");

  const [activeRequest, setActiveRequest] = useState(null);
  const [status, setStatus] = useState(null);
  const disabled = !!activeRequest;

  const [dropZone, setDropZone] = useState(false);
  const sendButtonEnabled = validUrl(baseUrl) && validTopic(topic) && !attachFileError;

  const open = !!props.openMode;

  useEffect(() => {
    const handleDragEnter = () => {
      props.onDragEnter();
      setDropZone(true);
    };
    window.addEventListener("dragenter", handleDragEnter);
    return () => window.removeEventListener("dragenter", handleDragEnter);
  }, []);

  useEffect(() => {
    setBaseUrl(props.baseUrl);
    setTopic(props.topic);
    setShowTopicUrl(!props.baseUrl || !props.topic);
    setMessageFocused(!!props.topic);
  }, [props.baseUrl, props.topic]);

  useEffect(() => {
    setMessage(props.message);
  }, [props.message]);

  const updateBaseUrl = (newVal) => {
    setBaseUrl(validUrl(newVal) ? newVal.replace(/\/$/, "") : newVal);
  };

  const handleSubmit = async (ev) => {
    ev?.preventDefault();
    if (!sendButtonEnabled || disabled) {
      return;
    }
    const url = new URL(topicUrl(baseUrl, topic));
    const params = { title, tags, click: clickUrl, attach: attachUrl, filename, email, delay };
    Object.entries(params).forEach(([key, value]) => {
      if (value.trim()) {
        url.searchParams.append(key, value.trim());
      }
    });
    if (priority !== 3) {
      url.searchParams.append("priority", priority.toString());
    }
    if (attachFile && message.trim()) {
      url.searchParams.append("message", message.replaceAll("\n", "\\n").trim());
    }
    if (markdownEnabled) {
      url.searchParams.append("markdown", "true");
    }

    const body = attachFile || message;
    try {
      const user = await userManager.get(baseUrl);
      const headers = maybeWithAuth({}, user);
      const progressFn = (e) => {
        if (e.loaded > 0 && e.total > 0) {
          setStatus({
            text: t("publish_dialog_progress_uploading_detail", {
              loaded: formatBytes(e.loaded),
              total: formatBytes(e.total),
              percent: Math.round((e.loaded * 100.0) / e.total),
            }),
          });
        } else {
          setStatus({ text: t("publish_dialog_progress_uploading") });
        }
      };
      const request = api.publishXHR(url, body, headers, progressFn);
      setActiveRequest(request);
      await request;
      if (!publishAnother) {
        props.onClose();
      } else {
        setStatus({ text: t("publish_dialog_message_published"), success: true });
        setActiveRequest(null);
      }
    } catch (e) {
      setStatus({ text: typeof e === "string" ? e : (e?.message ?? String(e)), error: true });
      setActiveRequest(null);
    }
  };

  const checkAttachmentLimits = async (file) => {
    try {
      const apiAccount = await accountApi.get();
      const fileSizeLimit = apiAccount.limits.attachment_file_size ?? 0;
      const remainingBytes = apiAccount.stats.attachment_total_size_remaining;
      const fileSizeLimitReached = fileSizeLimit > 0 && file.size > fileSizeLimit;
      const quotaReached = remainingBytes > 0 && file.size > remainingBytes;
      if (fileSizeLimitReached && quotaReached) {
        setAttachFileError(
          t("publish_dialog_attachment_limits_file_and_quota_reached", {
            fileSizeLimit: formatBytes(fileSizeLimit),
            remainingBytes: formatBytes(remainingBytes),
          }),
        );
      } else if (fileSizeLimitReached) {
        setAttachFileError(t("publish_dialog_attachment_limits_file_reached", { fileSizeLimit: formatBytes(fileSizeLimit) }));
      } else if (quotaReached) {
        setAttachFileError(t("publish_dialog_attachment_limits_quota_reached", { remainingBytes: formatBytes(remainingBytes) }));
      } else {
        setAttachFileError("");
      }
    } catch (e) {
      console.log(`[PublishDialog] Retrieving attachment limits failed`, e);
      if (e instanceof UnauthorizedError) {
        await session.resetAndRedirect(routes.login);
      } else {
        setAttachFileError(""); // The server enforces limits on upload
      }
    }
  };

  const updateAttachFile = async (file) => {
    if (!file) {
      return;
    }
    setAttachFile(file);
    setFilename(file.name);
    props.onResetOpenMode();
    await checkAttachmentLimits(file);
  };

  useEffect(() => {
    if (props.attachFile) {
      updateAttachFile(props.attachFile);
    }
  }, [props.attachFile]);

  const handlePaste = (ev) => {
    const blob = props.getPastedImage(ev);
    if (blob) {
      updateAttachFile(blob);
    }
  };

  const handleAttachFileDrop = async (ev) => {
    ev.preventDefault();
    setDropZone(false);
    await updateAttachFile(ev.dataTransfer.files[0]);
  };

  const handleAttachFileDragLeave = () => {
    setDropZone(false);
    if (props.openMode === PublishDialog.OPEN_MODE_DRAG) {
      props.onClose(); // Only close when the dialog was opened by the drag itself
    }
  };

  const handleEmojiPick = (emoji) => {
    setTags((prevTags) => (prevTags.trim() ? `${prevTags.trim()}, ${emoji}` : emoji));
  };

  const handleAttachUrlChange = (value) => {
    setAttachUrl(value);
    if (!filenameEdited) {
      try {
        const parts = new URL(value).pathname.split("/");
        setFilename(parts[parts.length - 1]);
      } catch (e) {
        // Not a URL yet
      }
    }
  };

  const extras = [
    { show: !showClickUrl, icon: Link2, label: t("publish_dialog_chip_click_label"), onClick: () => setShowClickUrl(true) },
    { show: !showEmail, icon: Mail, label: t("publish_dialog_chip_email_label"), onClick: () => setShowEmail(true) },
    {
      show: !showAttachUrl && !showAttachFile,
      icon: Paperclip,
      label: t("publish_dialog_chip_attach_url_label"),
      onClick: () => setShowAttachUrl(true),
    },
    {
      show: !showAttachFile && !showAttachUrl,
      icon: Upload,
      label: t("publish_dialog_chip_attach_file_label"),
      onClick: () => attachFileInput.current.click(),
    },
    { show: !showDelay, icon: Clock, label: t("publish_dialog_chip_delay_label"), onClick: () => setShowDelay(true) },
    { show: !showTopicUrl, icon: Globe, label: t("publish_dialog_chip_topic_label"), onClick: () => setShowTopicUrl(true) },
  ].filter((extra) => extra.show);

  return (
    <>
      {dropZone && open && <DropArea onDrop={handleAttachFileDrop} onDragLeave={handleAttachFileDragLeave} />}
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && props.onClose()}>
        <DialogContent
          className="sm:max-w-2xl"
          title={
            baseUrl && topic
              ? t("publish_dialog_title_topic", { topic: topicShortUrl(baseUrl, topic) })
              : t("publish_dialog_title_no_topic")
          }
        >
          <form id="publish-form" onSubmit={handleSubmit} className="relative flex flex-col gap-4">
            {dropZone && <DropBox />}
            {showTopicUrl && (
              <ClosableRow
                closable={!!props.baseUrl && !!props.topic}
                disabled={disabled}
                closeLabel={t("publish_dialog_topic_reset")}
                onClose={() => {
                  setBaseUrl(props.baseUrl);
                  setTopic(props.topic);
                  setShowTopicUrl(false);
                }}
              >
                <div className="grid flex-1 gap-3 sm:grid-cols-[3fr_2fr]">
                  <Field label={t("publish_dialog_base_url_label")} htmlFor="publish-base-url">
                    <Input
                      id="publish-base-url"
                      type="url"
                      placeholder={t("publish_dialog_base_url_placeholder")}
                      value={baseUrl}
                      onChange={(ev) => updateBaseUrl(ev.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                  <Field label={t("publish_dialog_topic_label")} htmlFor="publish-topic">
                    <Input
                      id="publish-topic"
                      placeholder={t("publish_dialog_topic_placeholder")}
                      value={topic}
                      onChange={(ev) => setTopic(ev.target.value)}
                      disabled={disabled}
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus={!messageFocused}
                    />
                  </Field>
                </div>
              </ClosableRow>
            )}

            <Field label={t("publish_dialog_title_label")} htmlFor="publish-title">
              <Input
                id="publish-title"
                placeholder={t("publish_dialog_title_placeholder")}
                value={title}
                onChange={(ev) => setTitle(ev.target.value)}
                disabled={disabled}
              />
            </Field>

            <Field label={t("publish_dialog_message_label")} htmlFor="publish-message">
              <Textarea
                id="publish-message"
                rows={5}
                placeholder={t("publish_dialog_message_placeholder")}
                value={message}
                onChange={(ev) => setMessage(ev.target.value)}
                onPaste={handlePaste}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
                    handleSubmit(ev);
                  }
                }}
                disabled={disabled}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus={messageFocused}
                className="resize-y"
              />
              <Checkbox
                label={t("publish_dialog_checkbox_markdown")}
                checked={markdownEnabled}
                onChange={setMarkdownEnabled}
                disabled={disabled}
                className="mt-1"
              />
            </Field>

            <Field label={t("publish_dialog_tags_label")} htmlFor="publish-tags">
              <div className="flex gap-2">
                <Input
                  id="publish-tags"
                  placeholder={t("publish_dialog_tags_placeholder")}
                  value={tags}
                  onChange={(ev) => setTags(ev.target.value)}
                  disabled={disabled}
                />
                <Popover.Root>
                  <Popover.Trigger asChild>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={disabled}
                      aria-label={t("publish_dialog_emoji_picker_show")}
                      className="w-10 shrink-0 px-0"
                    >
                      <Smile className="size-4" />
                    </Button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      align="end"
                      sideOffset={6}
                      collisionPadding={12}
                      className="z-50 flex max-h-80 w-[min(22rem,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-border bg-surface text-text shadow-xl"
                    >
                      <Suspense
                        fallback={
                          <div className="flex h-40 items-center justify-center">
                            <Spinner />
                          </div>
                        }
                      >
                        <EmojiPicker onEmojiPick={handleEmojiPick} />
                      </Suspense>
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              </div>
            </Field>

            <Field label={t("publish_dialog_priority_label")}>
              <PriorityPicker value={priority} onChange={setPriority} disabled={disabled} />
            </Field>

            {showClickUrl && (
              <ClosableRow
                disabled={disabled}
                closeLabel={t("publish_dialog_click_reset")}
                onClose={() => {
                  setClickUrl("");
                  setShowClickUrl(false);
                }}
              >
                <Field label={t("publish_dialog_click_label")} htmlFor="publish-click" className="flex-1">
                  <Input
                    id="publish-click"
                    type="url"
                    placeholder={t("publish_dialog_click_placeholder")}
                    value={clickUrl}
                    onChange={(ev) => setClickUrl(ev.target.value)}
                    disabled={disabled}
                  />
                </Field>
              </ClosableRow>
            )}

            {showEmail && (
              <ClosableRow
                disabled={disabled}
                closeLabel={t("publish_dialog_email_reset")}
                onClose={() => {
                  setEmail("");
                  setShowEmail(false);
                }}
              >
                <Field label={t("publish_dialog_email_label")} htmlFor="publish-email" className="flex-1">
                  <Input
                    id="publish-email"
                    type="email"
                    placeholder={t("publish_dialog_email_placeholder")}
                    value={email}
                    onChange={(ev) => setEmail(ev.target.value)}
                    disabled={disabled}
                  />
                </Field>
              </ClosableRow>
            )}

            {showAttachUrl && (
              <ClosableRow
                disabled={disabled}
                closeLabel={t("publish_dialog_attach_reset")}
                onClose={() => {
                  setAttachUrl("");
                  setFilename("");
                  setFilenameEdited(false);
                  setShowAttachUrl(false);
                }}
              >
                <div className="grid flex-1 gap-3 sm:grid-cols-[3fr_2fr]">
                  <Field label={t("publish_dialog_attach_label")} htmlFor="publish-attach">
                    <Input
                      id="publish-attach"
                      type="url"
                      placeholder={t("publish_dialog_attach_placeholder")}
                      value={attachUrl}
                      onChange={(ev) => handleAttachUrlChange(ev.target.value)}
                      disabled={disabled}
                    />
                  </Field>
                  <Field label={t("publish_dialog_filename_label")} htmlFor="publish-filename">
                    <Input
                      id="publish-filename"
                      placeholder={t("publish_dialog_filename_placeholder")}
                      value={filename}
                      onChange={(ev) => {
                        setFilename(ev.target.value);
                        setFilenameEdited(true);
                      }}
                      disabled={disabled}
                    />
                  </Field>
                </div>
              </ClosableRow>
            )}

            <input
              type="file"
              ref={attachFileInput}
              onChange={(ev) => updateAttachFile(ev.target.files[0])}
              className="hidden"
              aria-hidden
              tabIndex={-1}
            />
            {showAttachFile && (
              <AttachmentBox
                file={attachFile}
                filename={filename}
                disabled={disabled}
                error={attachFileError}
                onChangeFilename={setFilename}
                onClose={() => {
                  setAttachFile(null);
                  setAttachFileError("");
                  setFilename("");
                }}
              />
            )}

            {showDelay && (
              <ClosableRow
                disabled={disabled}
                closeLabel={t("publish_dialog_delay_reset")}
                onClose={() => {
                  setDelay("");
                  setShowDelay(false);
                }}
              >
                <Field label={t("publish_dialog_delay_label")} htmlFor="publish-delay" className="flex-1">
                  <Input
                    id="publish-delay"
                    placeholder={t("publish_dialog_delay_placeholder", {
                      unixTimestamp: "1649029748",
                      relativeTime: "30m",
                      naturalLanguage: "tomorrow, 9am",
                    })}
                    value={delay}
                    onChange={(ev) => setDelay(ev.target.value)}
                    disabled={disabled}
                  />
                </Field>
              </ClosableRow>
            )}

            {extras.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">{t("publish_dialog_other_features")}</p>
                <div className="flex flex-wrap gap-2">
                  {extras.map(({ icon: Icon, label, onClick }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={onClick}
                      disabled={disabled}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border-strong px-3 text-sm text-text transition-colors hover:border-accent hover:bg-accent-soft disabled:opacity-50"
                    >
                      <Plus className="size-3.5 text-muted" aria-hidden />
                      <Icon className="size-3.5" aria-hidden />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-muted">
              <Trans
                i18nKey="publish_dialog_details_examples_description"
                components={{
                  docsLink: <DocsLink />,
                }}
              />
            </p>
          </form>

          <div className="mt-6 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 text-sm" aria-live="polite">
              {status && (
                <span
                  className={cn(
                    status.error && "text-danger",
                    status.success && "text-success",
                    !status.error && !status.success && "text-muted",
                  )}
                >
                  {status.text}
                </span>
              )}
            </div>
            {activeRequest ? (
              <Button type="button" variant="secondary" onClick={() => activeRequest.abort()}>
                <Spinner className="size-4" />
                {t("publish_dialog_button_cancel_sending")}
              </Button>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Checkbox
                  label={t("publish_dialog_checkbox_publish_another")}
                  checked={publishAnother}
                  onChange={setPublishAnother}
                  className="mr-2"
                />
                <Button type="button" variant="ghost" onClick={props.onClose}>
                  {t("publish_dialog_button_cancel")}
                </Button>
                <Button type="submit" form="publish-form" disabled={!sendButtonEnabled}>
                  {t("publish_dialog_button_send")}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

const DocsLink = ({ children }) => (
  <a href="https://docs.ntfy.sh/publish/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
    {children}
  </a>
);

const PriorityPicker = ({ value, onChange, disabled }) => {
  const { t } = useTranslation();
  const priorities = [
    { value: 1, label: t("priority_min"), title: t("publish_dialog_priority_min") },
    { value: 2, label: t("priority_low"), title: t("publish_dialog_priority_low") },
    { value: 3, label: t("priority_default"), title: t("publish_dialog_priority_default") },
    { value: 4, label: t("priority_high"), title: t("publish_dialog_priority_high"), tone: "text-warning" },
    { value: 5, label: t("priority_max"), title: t("publish_dialog_priority_max"), tone: "text-danger" },
  ];
  return (
    <div role="radiogroup" aria-label={t("publish_dialog_priority_label")} className="grid grid-cols-5 gap-1 rounded-xl bg-surface-2 p-1">
      {priorities.map((p) => {
        const selected = p.value === value;
        return (
          <button
            key={p.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t("notifications_priority_x", { priority: p.value })}
            title={p.title}
            disabled={disabled}
            onClick={() => onChange(p.value)}
            className={cn(
              "h-8 truncate rounded-lg px-1 text-sm font-medium capitalize transition-colors",
              selected ? cn("bg-surface shadow-sm", p.tone ?? "text-text") : "text-muted hover:text-text",
            )}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
};

const Checkbox = ({ label, checked, onChange, disabled, className }) => (
  // eslint-disable-next-line jsx-a11y/label-has-associated-control
  <label className={cn("inline-flex cursor-pointer select-none items-center gap-2 text-sm", disabled && "opacity-60", className)}>
    <input
      type="checkbox"
      checked={checked}
      onChange={(ev) => onChange(ev.target.checked)}
      disabled={disabled}
      className="size-4 rounded accent-accent"
    />
    {label}
  </label>
);

const ClosableRow = ({ closable = true, disabled, closeLabel, onClose, children }) => (
  <div className="flex items-end gap-2">
    {children}
    {closable && (
      <IconButton label={closeLabel} onClick={onClose} disabled={disabled} className="mb-0.5 shrink-0">
        <X className="size-4" />
      </IconButton>
    )}
  </div>
);

const AttachmentBox = ({ file, filename, disabled, error, onChangeFilename, onClose }) => {
  const { t } = useTranslation();
  const [previewUrl, setPreviewUrl] = useState(undefined);

  useEffect(() => {
    if (!imageRegex.test(file.name)) {
      setPreviewUrl(undefined);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">{t("publish_dialog_attached_file_title")}</p>
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border p-2",
          error ? "border-danger/40 bg-danger/5" : "border-border bg-surface-2",
        )}
      >
        <AttachmentIcon type={file.type} href={previewUrl} />
        <div className="min-w-0 flex-1">
          <input
            aria-label={t("publish_dialog_attached_file_filename_placeholder")}
            placeholder={t("publish_dialog_attached_file_filename_placeholder")}
            value={filename}
            onChange={(ev) => onChangeFilename(ev.target.value)}
            disabled={disabled}
            className="w-full truncate rounded bg-transparent text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-soft"
          />
          <p className="text-xs text-muted">
            {formatBytes(file.size)}
            {error && (
              <span className="text-danger" aria-live="polite">
                {" "}
                · {error}
              </span>
            )}
          </p>
        </div>
        <IconButton label={t("publish_dialog_attached_file_remove")} onClick={onClose} disabled={disabled} className="shrink-0">
          <X className="size-4" />
        </IconButton>
      </div>
    </div>
  );
};

/** Invisible full-screen drop target; Radix disables pointer events outside the dialog, so it opts back in. */
const DropArea = ({ onDrop, onDragLeave }) => {
  const allowDrag = (ev) => {
    // eslint-disable-next-line no-param-reassign
    ev.dataTransfer.dropEffect = "copy";
    ev.preventDefault();
  };
  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-[60]"
      onDrop={onDrop}
      onDragEnter={allowDrag}
      onDragOver={allowDrag}
      onDragLeave={onDragLeave}
    />,
    document.body,
  );
};

const DropBox = () => {
  const { t } = useTranslation();
  return (
    <div className="absolute -inset-2 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-surface/90 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-2 text-accent">
        <Upload className="size-8" aria-hidden />
        <p className="text-lg font-semibold">{t("publish_dialog_drop_file_here")}</p>
      </div>
    </div>
  );
};

PublishDialog.OPEN_MODE_DEFAULT = "default";
PublishDialog.OPEN_MODE_DRAG = "drag";

export default PublishDialog;
