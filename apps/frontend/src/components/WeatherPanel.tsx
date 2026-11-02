import type { WeatherReport } from '@prime/shared';
import { CloseIcon } from './icons';

const dayLabel = (date: string, index: number) =>
  index === 0 ? 'Today' : new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: 'short' });

interface WeatherPanelProps {
  report: WeatherReport;
  onClose: () => void;
}

export function WeatherPanel({ report, onClose }: WeatherPanelProps) {
  const { current, daily } = report;
  return (
    <section className="side-panel panel weather" aria-label="Weather">
      <div className="side-panel__header">
        <span className="side-panel__title">
          Weather <span className="side-panel__subject">{report.location}</span>
        </span>
        <button type="button" className="hud-btn hud-btn--icon side-panel__close" onClick={onClose} aria-label="Hide weather" title="Hide weather">
          <CloseIcon />
        </button>
      </div>

      <div className="weather__now">
        <span className="weather__temp">{current.temperatureC}°</span>
        <div className="weather__summary">
          <span className="weather__condition">{current.condition}</span>
          <span className="weather__details">
            Feels {current.feelsLikeC}° · Humidity {current.humidityPercent}% · Wind {current.windKph} km/h
          </span>
        </div>
      </div>

      <div className="weather__days">
        {daily.map((day, i) => (
          <div className="weather__day" key={day.date}>
            <span className="weather__day-name">{dayLabel(day.date, i)}</span>
            <span className="weather__day-temp">
              {day.maxC}° <span>{day.minC}°</span>
            </span>
            <span className="weather__day-cond">{day.condition}</span>
            {day.rainChancePercent !== null && <span className="weather__day-rain">Rain {day.rainChancePercent}%</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
