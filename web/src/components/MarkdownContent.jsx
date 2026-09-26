import * as React from "react";
import { useEffect } from "react";
import { useRemark } from "react-remark";
import { sanitizeUrl } from "../app/utils";

// Strips unsafe URL protocols (javascript:, data:, ...) from links and images; React otherwise
// throws an uncaught "React has blocked a javascript: URL" error at render time.
const SafeLink = ({ href, children, ...props }) => (
  <a href={sanitizeUrl(href)} target="_blank" rel="noopener noreferrer" {...props}>
    {children}
  </a>
);

const SafeImage = ({ src, alt, ...props }) => <img src={sanitizeUrl(src)} alt={alt} {...props} />;

// react-remark and its unified stack are heavy, so Notifications.jsx loads this module lazily,
// only when a text/markdown message is shown. Styling lives in the .markdown rules of styles.css.
const MarkdownContent = ({ content }) => {
  const [reactContent, setMarkdownSource] = useRemark({
    rehypeReactOptions: { components: { a: SafeLink, img: SafeImage } },
  });

  useEffect(() => {
    setMarkdownSource(content);
  }, [content]);

  return <div className="markdown">{reactContent}</div>;
};

export default MarkdownContent;
