import type { PlacesResult } from '@prime/shared';
import { CloseIcon } from './icons';

interface PlacesPanelProps {
  result: PlacesResult;
  onClose: () => void;
}

export function PlacesPanel({ result, onClose }: PlacesPanelProps) {
  return (
    <section className="side-panel panel places" aria-label="Places">
      <div className="side-panel__header">
        <span className="side-panel__title">
          Places <span className="side-panel__subject">{result.near ? `${result.query} · near you` : result.query}</span>
        </span>
        <button type="button" className="hud-btn hud-btn--icon side-panel__close" onClick={onClose} aria-label="Hide places" title="Hide places">
          <CloseIcon />
        </button>
      </div>

      <ol className="places__list">
        {result.places.map((place) => (
          <li key={`${place.latitude},${place.longitude}`} className="places__item">
            <div className="places__main">
              <a href={place.mapsUrl} target="_blank" rel="noopener noreferrer" className="places__name">
                {place.name}
              </a>
              <span className="places__address">{place.address}</span>
            </div>
            <div className="places__meta">
              {place.distanceKm !== null && <span className="places__distance">{place.distanceKm} km</span>}
              <span className="places__category">{place.category}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
