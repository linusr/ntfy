import * as React from "react";
import { useState } from "react";
import { ChevronUp, SendHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import PublishDialog from "./PublishDialog";
import api from "../app/Api";
import IconButton from "./ui/IconButton";
import { useToast } from "./ui/Toast";

const Messaging = (props) => {
  const [message, setMessage] = useState("");
  const [attachFile, setAttachFile] = useState(null);
  const [dialogKey, setDialogKey] = useState(0);

  const { dialogOpenMode } = props;
  const subscription = props.selected;

  const handleOpenDialogClick = () => {
    props.onDialogOpenModeChange(PublishDialog.OPEN_MODE_DEFAULT);
  };

  const handleDialogClose = () => {
    props.onDialogOpenModeChange("");
    setDialogKey((prev) => prev + 1);
    setAttachFile(null);
  };

  const getPastedImage = (ev) => {
    const { items } = ev.clipboardData;
    for (let i = 0; i < items.length; i += 1) {
      if (items[i].type.indexOf("image") !== -1) {
        return items[i].getAsFile();
      }
    }
    return null;
  };

  return (
    <>
      {subscription && (
        <MessageBar
          subscription={subscription}
          message={message}
          onMessageChange={setMessage}
          onFilePasted={setAttachFile}
          onOpenDialogClick={handleOpenDialogClick}
          getPastedImage={getPastedImage}
        />
      )}
      <PublishDialog
        key={`publishDialog${dialogKey}`} // A new key resets the form after close
        openMode={dialogOpenMode}
        baseUrl={subscription?.baseUrl ?? config.base_url}
        topic={subscription?.topic ?? ""}
        message={message}
        attachFile={attachFile}
        getPastedImage={getPastedImage}
        onClose={handleDialogClose}
        onDragEnter={() => props.onDialogOpenModeChange((prev) => prev || PublishDialog.OPEN_MODE_DRAG)} // Only update if not already open
        onResetOpenMode={() => props.onDialogOpenModeChange(PublishDialog.OPEN_MODE_DEFAULT)}
      />
    </>
  );
};

const MessageBar = (props) => {
  const { t } = useTranslation();
  const toast = useToast();
  const { subscription } = props;

  const handleSendClick = async () => {
    if (!props.message.trim()) {
      return;
    }
    try {
      await api.publish(subscription.baseUrl, subscription.topic, props.message);
    } catch (e) {
      console.log(`[MessageBar] Error publishing message`, e);
      toast(t("message_bar_error_publishing"));
    }
    props.onMessageChange("");
  };

  const handlePaste = (ev) => {
    const blob = props.getPastedImage(ev);
    if (blob) {
      props.onFilePasted(blob);
      props.onOpenDialogClick();
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/80 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl backdrop-saturate-150 sm:left-[272px] sm:px-6">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
        <IconButton label={t("message_bar_show_dialog")} onClick={props.onOpenDialogClick}>
          <ChevronUp className="size-5" />
        </IconButton>
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          type="text"
          placeholder={t("message_bar_type_message")}
          aria-label={t("message_bar_type_message")}
          value={props.message}
          onChange={(ev) => props.onMessageChange(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" && !ev.nativeEvent.isComposing) {
              ev.preventDefault();
              handleSendClick();
            }
          }}
          onPaste={handlePaste}
          className="h-10 min-w-0 flex-1 rounded-full border border-border-strong bg-bg px-4 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent-soft"
        />
        <button
          type="button"
          onClick={handleSendClick}
          disabled={!props.message.trim()}
          aria-label={t("message_bar_publish")}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-colors hover:bg-accent-hover disabled:bg-surface-2 disabled:text-muted"
        >
          <SendHorizontal className="size-[18px]" />
        </button>
      </div>
    </div>
  );
};

export default Messaging;
