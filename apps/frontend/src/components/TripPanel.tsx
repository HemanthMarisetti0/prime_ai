import type { TripPlan } from '@prime/shared';
import { CloseIcon } from './icons';

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

interface TripPanelProps {
  plan: TripPlan;
  onClose: () => void;
}

export function TripPanel({ plan, onClose }: TripPanelProps) {
  const { budget } = plan;
  const perPerson = plan.travellers > 1 ? budget.total / plan.travellers : null;

  return (
    <section className="side-panel panel trip" aria-label="Trip plan">
      <div className="side-panel__header">
        <span className="side-panel__title">
          Trip plan{' '}
          <span className="side-panel__subject">
            {plan.destination} · {plan.durationDays} {plan.durationDays === 1 ? 'day' : 'days'}
            {plan.travellers > 1 && ` · ${plan.travellers} travellers`}
          </span>
        </span>
        <button type="button" className="hud-btn hud-btn--icon side-panel__close" onClick={onClose} aria-label="Hide trip plan" title="Hide trip plan">
          <CloseIcon />
        </button>
      </div>

      {plan.summary && <p className="trip__summary">{plan.summary}</p>}

      <div className="trip__budget">
        <div className="trip__total">
          <span className="trip__total-value">{formatMoney(budget.total, budget.currency)}</span>
          <span className="trip__total-label">
            Estimated total{perPerson !== null && ` · ${formatMoney(perPerson, budget.currency)} per person`}
          </span>
        </div>
        <ul className="trip__items">
          {budget.items.map((item) => (
            <li key={item.category}>
              <span className="trip__item-name">
                {item.category}
                {item.note && <span className="trip__item-note">{item.note}</span>}
              </span>
              <span className="trip__item-amount">{formatMoney(item.amount, budget.currency)}</span>
              <span className="trip__item-bar" style={{ width: `${budget.total ? (item.amount / budget.total) * 100 : 0}%` }} />
            </li>
          ))}
        </ul>
      </div>

      <ol className="trip__days">
        {plan.days.map((day) => (
          <li key={day.day}>
            <span className="trip__day-label">Day {day.day}</span>
            <span className="trip__day-title">{day.title}</span>
            <ul>
              {day.activities.map((activity, i) => (
                <li key={i}>{activity}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      {plan.tips.length > 0 && (
        <ul className="trip__tips">
          {plan.tips.map((tip, i) => (
            <li key={i}>{tip}</li>
          ))}
        </ul>
      )}
      <p className="trip__disclaimer">Costs are estimates, Sir; please verify current prices before booking.</p>
    </section>
  );
}
