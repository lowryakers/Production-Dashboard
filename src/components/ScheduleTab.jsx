import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from 'recharts';

const STATUS_COLORS = {
  completed: '#10b981',
  scheduled: '#3b82f6',
  unplanned: '#f59e0b',
};

function normalizeMO(mo) {
  if (!mo) return null;
  const m = mo.replace(/[^0-9]/g, '');
  return m ? `MO${m}` : null;
}

export default function ScheduleTab({ runs, schedule }) {
  const analysis = useMemo(() => {
    if (!schedule.length) return null;

    const scheduledMOs = new Map();
    schedule.forEach((s) => {
      if (!s.mo) return;
      const key = normalizeMO(s.mo);
      if (!key) return;
      if (!scheduledMOs.has(key)) {
        scheduledMOs.set(key, { ...s, dates: [] });
      }
      if (s.date) scheduledMOs.get(key).dates.push(s.date);
    });

    const actualMOs = new Map();
    runs.forEach((r) => {
      if (!r.mo) return;
      const key = normalizeMO(r.mo);
      if (!key) return;
      if (!actualMOs.has(key)) {
        actualMOs.set(key, { mo: key, runs: [], totalQty: 0, product: r.product, team: r.team });
      }
      actualMOs.get(key).runs.push(r);
      actualMOs.get(key).totalQty += r.quantity;
    });

    const completed = [];
    const scheduledOnly = [];
    const unplanned = [];

    for (const [mo, sched] of scheduledMOs) {
      if (actualMOs.has(mo)) {
        const actual = actualMOs.get(mo);
        completed.push({ mo, scheduled: sched, actual });
      } else {
        scheduledOnly.push({ mo, scheduled: sched });
      }
    }

    for (const [mo, actual] of actualMOs) {
      if (!scheduledMOs.has(mo)) {
        unplanned.push({ mo, actual });
      }
    }

    // Daily comparison
    const dailyMap = {};
    schedule.forEach((s) => {
      if (!s.date) return;
      if (!dailyMap[s.date]) dailyMap[s.date] = { date: s.date, scheduled: 0, completed: 0 };
      dailyMap[s.date].scheduled += 1;
    });
    runs.forEach((r) => {
      if (!dailyMap[r.dateStr]) dailyMap[r.dateStr] = { date: r.dateStr, scheduled: 0, completed: 0 };
      dailyMap[r.dateStr].completed += 1;
    });
    const dailyChart = Object.values(dailyMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);

    return {
      completed,
      scheduledOnly,
      unplanned,
      dailyChart,
      adherenceRate: scheduledMOs.size > 0
        ? ((completed.length / scheduledMOs.size) * 100).toFixed(0)
        : 0,
    };
  }, [runs, schedule]);

  if (!schedule.length) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <p className="text-gray-500 text-lg mb-2">Schedule data not available</p>
        <p className="text-gray-400 text-sm">
          The Weekly Schedule Google Sheet hasn't loaded yet. Make sure the <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">SCHEDULE_SHEET_URL</code> environment variable is set in Railway, then hit Refresh.
        </p>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="text-sm font-medium text-gray-500 mb-1">Schedule Adherence</div>
          <div className="text-3xl font-bold text-gray-900">{analysis.adherenceRate}%</div>
          <div className="text-xs text-gray-400 mt-1">of scheduled MOs completed</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS.completed }} />
            <span className="text-sm font-medium text-gray-500">Completed (Scheduled)</span>
          </div>
          <div className="text-3xl font-bold text-emerald-600">{analysis.completed.length}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS.scheduled }} />
            <span className="text-sm font-medium text-gray-500">Scheduled (Not Started)</span>
          </div>
          <div className="text-3xl font-bold text-blue-600">{analysis.scheduledOnly.length}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS.unplanned }} />
            <span className="text-sm font-medium text-gray-500">Unplanned Work</span>
          </div>
          <div className="text-3xl font-bold text-amber-600">{analysis.unplanned.length}</div>
        </div>
      </div>

      {/* Daily chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Daily: Scheduled vs Completed Runs</h3>
        <p className="text-sm text-gray-500 mb-4">Last 30 days of activity</p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={analysis.dailyChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => {
                const d = new Date(v + 'T00:00:00');
                return `${d.getMonth() + 1}/${d.getDate()}`;
              }}
            />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip labelFormatter={(v) => v} />
            <Legend />
            <Bar dataKey="scheduled" name="Scheduled" fill={STATUS_COLORS.scheduled} radius={[2, 2, 0, 0]} />
            <Bar dataKey="completed" name="Completed" fill={STATUS_COLORS.completed} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Completed MOs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Completed MOs <span className="text-sm font-normal text-emerald-600">({analysis.completed.length})</span>
          </h3>
          <div className="space-y-2 max-h-[350px] overflow-y-auto">
            {analysis.completed.slice(0, 30).map((item) => (
              <div key={item.mo} className="flex justify-between items-center text-sm py-1.5 border-b border-gray-50">
                <div>
                  <span className="font-medium text-gray-900">{item.mo}</span>
                  <span className="text-gray-500 ml-2 text-xs">
                    {item.actual.product?.slice(0, 30)}{item.actual.product?.length > 30 ? '…' : ''}
                  </span>
                </div>
                <span className="text-emerald-600 font-medium">
                  {item.actual.totalQty.toLocaleString(undefined, { maximumFractionDigits: 0 })} units
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Scheduled but not completed */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Scheduled — Not Completed <span className="text-sm font-normal text-blue-600">({analysis.scheduledOnly.length})</span>
          </h3>
          <div className="space-y-2 max-h-[350px] overflow-y-auto">
            {analysis.scheduledOnly.length === 0 ? (
              <p className="text-gray-400 text-sm">All scheduled MOs have been worked on</p>
            ) : (
              analysis.scheduledOnly.slice(0, 30).map((item) => (
                <div key={item.mo} className="flex justify-between items-center text-sm py-1.5 border-b border-gray-50">
                  <div>
                    <span className="font-medium text-gray-900">{item.mo}</span>
                    <span className="text-gray-500 ml-2 text-xs">
                      {item.scheduled.product?.slice(0, 30)}{item.scheduled.product?.length > 30 ? '…' : ''}
                    </span>
                  </div>
                  <span className="text-blue-600 text-xs">
                    Room {item.scheduled.room} · {item.scheduled.dayLabel}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Unplanned work */}
      {analysis.unplanned.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Unplanned Work <span className="text-sm font-normal text-amber-600">({analysis.unplanned.length} MOs not on schedule)</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
            {analysis.unplanned.slice(0, 30).map((item) => (
              <div key={item.mo} className="text-sm py-1.5 px-2 bg-amber-50 rounded-lg">
                <span className="font-medium text-gray-900">{item.mo}</span>
                <span className="text-gray-500 ml-1 text-xs">{item.actual.team}</span>
                <div className="text-xs text-gray-400">
                  {item.actual.totalQty.toLocaleString(undefined, { maximumFractionDigits: 0 })} units · {item.actual.runs.length} run{item.actual.runs.length !== 1 ? 's' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
