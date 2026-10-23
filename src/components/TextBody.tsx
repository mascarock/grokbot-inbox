import { linkifyToHtml, splitQuotedText } from '../lib/text';

export function TextBody({ text }: { text: string }) {
  const segments = splitQuotedText(text);
  return (
    <div className="text-body">
      {segments.map((segment, index) =>
        segment.type === 'quote' ? (
          <details key={index} className="quoted-reply">
            <summary>Quoted text</summary>
            <div className="text-pre" dangerouslySetInnerHTML={{ __html: linkifyToHtml(segment.content) }} />
          </details>
        ) : (
          <div key={index} className="text-pre" dangerouslySetInnerHTML={{ __html: linkifyToHtml(segment.content) }} />
        ),
      )}
    </div>
  );
}
