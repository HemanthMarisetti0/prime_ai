import type { NewsReport } from '@prime/shared';
import { CloseIcon } from './icons';

function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

interface NewsPanelProps {
  report: NewsReport;
  onClose: () => void;
}

export function NewsPanel({ report, onClose }: NewsPanelProps) {
  return (
    <section className="side-panel panel news" aria-label="News headlines">
      <div className="side-panel__header">
        <span className="side-panel__title">
          Headlines <span className="side-panel__subject">{report.topic ?? `Top stories · ${report.region}`}</span>
        </span>
        <button type="button" className="hud-btn hud-btn--icon side-panel__close" onClick={onClose} aria-label="Hide headlines" title="Hide headlines">
          <CloseIcon />
        </button>
      </div>

      <ol className="news__list">
        {report.items.map((item) => (
          <li key={item.url} className="news__item">
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="news__title">
              {item.title}
            </a>
            <span className="news__meta">
              {item.source} · {timeAgo(item.publishedAt)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
