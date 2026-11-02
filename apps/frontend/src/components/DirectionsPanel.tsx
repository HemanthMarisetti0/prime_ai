import type { DirectionsResult, TravelMode } from '@prime/shared';
import { CloseIcon } from './icons';

const MODE_LABEL: Record<TravelMode, string> = {
  driving: 'Drive',
  walking: 'Walk',
  cycling: 'Cycle',
  transit: 'Transit',
};

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

interface DirectionsPanelProps {
  result: DirectionsResult;
  onClose: () => void;
}

export function DirectionsPanel({ result, onClose }: DirectionsPanelProps) {
  return (
    <section className="side-panel panel directions" aria-label="Directions">
      <div className="side-panel__header">
        <span className="side-panel__title">
          Route <span className="side-panel__subject">{MODE_LABEL[result.mode]}</span>
        </span>
        <button type="button" className="hud-btn hud-btn--icon side-panel__close" onClick={onClose} aria-label="Hide route" title="Hide route">
          <CloseIcon />
        </button>
      </div>

      <div className="directions__ends">
        <span>{result.from}</span>
        <span className="directions__arrow" aria-hidden="true">
          →
        </span>
        <span>{result.to}</span>
      </div>

      <div className="directions__summary">
        <div>
          <span className="directions__value">{result.distanceKm} km</span>
          <span className="directions__label">{result.mode === 'transit' ? 'Straight line' : 'Distance'}</span>
        </div>
        {result.durationMinutes !== null && (
          <div>
            <span className="directions__value">{formatDuration(result.durationMinutes)}</span>
            <span className="directions__label">Est. time · no traffic</span>
          </div>
        )}
      </div>

      {result.steps.length > 0 && (
        <ol className="directions__steps">
          {result.steps.map((step, i) => (
            <li key={i}>
              <span>{step.instruction}</span>
              {step.distanceKm > 0 && <span className="directions__step-distance">{step.distanceKm} km</span>}
            </li>
          ))}
        </ol>
      )}

      <a className="hud-btn directions__navigate" href={result.navigationUrl} target="_blank" rel="noopener noreferrer">
        {result.mode === 'transit' ? 'Transit routes in Google Maps ↗' : 'Start navigation ↗'}
      </a>
    </section>
  );
}
