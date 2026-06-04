import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { getTeamColor } from '../utils/parseSheet';

export default function ProductionTab({ runs }) {
  const teams = [...new Set(runs.map((r) => r.team))].sort();

  const weeklyData = {};
  runs.forEach((r) => {
    if (!weeklyData[r.week]) weeklyData[r.week] = { week: r.week };
    weeklyData[r.week][r.team] = (weeklyData[r.week][r.team] || 0) + r.quantity;
  });
  const weeklyChart = Object.values(weeklyData).sort((a, b) => a.week.localeCompare(b.week));

  const teamTotals = {};
  runs.forEach((r) => {
    if (!teamTotals[r.team]) teamTotals[r.team] = { team: r.team, units: 0, runs: 0, manHours: 0 };
    teamTotals[r.team].units += r.quantity;
    teamTotals[r.team].runs += 1;
    teamTotals[r.team].manHours += r.manHours || 0;
  });
  const teamCards = Object.values(teamTotals).sort((a, b) => b.units - a.units);
  const maxUnits = Math.max(...teamCards.map((t) => t.units), 1);

  const productTotals = {};
  runs.forEach((r) => {
    const name = r.product || 'Unknown';
    productTotals[name] = (productTotals[name] || 0) + r.quantity;
  });
  const topProducts = Object.entries(productTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name: name.length > 40 ? name.slice(0, 40) + '…' : name, value }));

  const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Weekly Production by Team</h3>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={weeklyChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="week"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => {
                const d = new Date(v + 'T00:00:00');
                return `${d.getMonth() + 1}/${d.getDate()}`;
              }}
            />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
            <Tooltip
              formatter={(value) => value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              labelFormatter={(v) => `Week of ${v}`}
            />
            <Legend />
            {teams.map((team) => (
              <Bar key={team} dataKey={team} stackId="a" fill={getTeamColor(team)} radius={[2, 2, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Summary</h3>
          <div className="space-y-4">
            {teamCards.map((t) => (
              <div key={t.team}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium" style={{ color: getTeamColor(t.team) }}>{t.team}</span>
                  <span className="text-sm text-gray-600">
                    {t.units.toLocaleString(undefined, { maximumFractionDigits: 0 })} units · {t.runs} runs
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div
                    className="h-2.5 rounded-full transition-all"
                    style={{
                      width: `${(t.units / maxUnits) * 100}%`,
                      backgroundColor: getTeamColor(t.team),
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top 10 Products</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={topProducts}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={110}
                dataKey="value"
                label={({ name, percent }) => `${name.slice(0, 15)}… ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
                fontSize={10}
              >
                {topProducts.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => v.toLocaleString(undefined, { maximumFractionDigits: 0 })} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
