import { useState } from 'react';
import type { PersonProfile } from '@prime/shared';
import { CloseIcon } from './icons';

interface PersonPanelProps {
  profile: PersonProfile;
  onClose: () => void;
}

export function PersonPanel({ profile, onClose }: PersonPanelProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = profile.imageUrl && !imageFailed;

  return (
    <section className="side-panel panel person" aria-label={`About ${profile.name}`}>
      <div className="side-panel__header">
        <span className="side-panel__title">
          {profile.isPerson ? 'Profile' : 'Briefing'} <span className="side-panel__subject">{profile.name}</span>
        </span>
        <button type="button" className="hud-btn hud-btn--icon side-panel__close" onClick={onClose} aria-label="Hide profile" title="Hide profile">
          <CloseIcon />
        </button>
      </div>

      <div className="person__body">
        <div className="person__intro">
          {showImage && (
            <img
              className="person__photo"
              src={profile.imageUrl!}
              alt={profile.name}
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
            />
          )}
          <div className="person__heading">
            <h2 className="person__name">{profile.name}</h2>
            {profile.description && <p className="person__description">{profile.description}</p>}
            {profile.facts.length > 0 && (
              <dl className="person__facts">
                {profile.facts.map((fact) => (
                  <div key={fact.label} className="person__fact">
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>

        <p className="person__summary">{profile.summary}</p>
      </div>

      <a className="person__link" href={profile.sourceUrl} target="_blank" rel="noopener noreferrer">
        Read more on Wikipedia ↗
      </a>
    </section>
  );
}
