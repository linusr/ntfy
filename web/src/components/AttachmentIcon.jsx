import * as React from "react";
import { useTranslation } from "react-i18next";
import { FileArchive, FileAudio, FileImage, FileText, FileVideo, Package } from "lucide-react";

const iconFor = (type) => {
  if (!type) return [FileText, "notifications_attachment_file_document"];
  if (type.startsWith("image/")) return [FileImage, "notifications_attachment_file_image"];
  if (type.startsWith("video/")) return [FileVideo, "notifications_attachment_file_video"];
  if (type.startsWith("audio/")) return [FileAudio, "notifications_attachment_file_audio"];
  if (type === "application/vnd.android.package-archive") return [Package, "notifications_attachment_file_app"];
  if (/zip|tar|gzip|compressed/.test(type)) return [FileArchive, "notifications_attachment_file_document"];
  return [FileText, "notifications_attachment_file_document"];
};

const AttachmentIcon = ({ type }) => {
  const { t } = useTranslation();
  const [Icon, labelKey] = iconFor(type);
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent" title={t(labelKey)}>
      <Icon className="size-5" aria-label={t(labelKey)} />
    </span>
  );
};

export default AttachmentIcon;
