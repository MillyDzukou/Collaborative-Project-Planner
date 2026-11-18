import type { Schedule, Task } from "../api/client.js";

export default function Gantt({ tasks, schedule }: { tasks: Task[]; schedule: Schedule }) {
  const total = Math.max(schedule.projectDurationWeeks, 1);
  const byId = new Map(schedule.tasks.map((s) => [s.id, s]));
  const ticks = Array.from({ length: total + 1 }, (_, i) => i).filter((i) => total <= 20 || i % 5 === 0);

  return (
    <div className="gantt" role="img" aria-label="Gantt chart of the schedule">
      <div className="gantt-scroll">
        <div className="gantt-inner" style={{ minWidth: Math.max(total * 28, 320) }}>
          <div className="gantt-axis">
            {ticks.map((t) => (
              <span key={t} style={{ left: `${(t / total) * 100}%` }}>{t}</span>
            ))}
          </div>
          {tasks.map((t) => {
            const s = byId.get(t.id);
            if (!s) return null;
            return (
              <div key={t.id} className="gantt-row">
                <span className="gantt-label">{t.name}</span>
                <div className="gantt-track">
                  <div
                    className={s.critical ? "bar critical" : "bar"}
                    style={{ left: `${(s.earlyStart / total) * 100}%`, width: `${(t.durationWeeks / total) * 100}%` }}
                    title={`${t.name}: weeks ${s.earlyStart}–${s.earlyFinish}, float ${s.float}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="muted"><span className="swatch critical" /> critical <span className="swatch" /> non-critical (weeks)</p>
    </div>
  );
}
