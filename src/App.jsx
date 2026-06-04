import { useState } from 'react';
import { useSheetData } from './hooks/useSheetData';
import FilterBar from './components/FilterBar';
import KPICards from './components/KPICards';
import ProductionTab from './components/ProductionTab';
import EfficiencyTab from './components/EfficiencyTab';
import StaffingTab from './components/StaffingTab';
import RunLog from './components/RunLog';
import ScheduleTab from './components/ScheduleTab';
import { BarChart3, TrendingUp, Users, List, CalendarCheck } from 'lucide-react';

const TABS = [
  { id: 'production', label: 'Production', icon: BarChart3 },
  { id: 'efficiency', label: 'Efficiency', icon: TrendingUp },
  { id: 'staffing', label: 'Staffing', icon: Users },
  { id: 'schedule', label: 'Schedule', icon: CalendarCheck },
  { id: 'log', label: 'Run Log', icon: List },
];

function App() {
  const [activeTab, setActiveTab] = useState('production');
  const data = useSheetData();

  if (data.loading && !data.runs.length) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-powder-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading from Google Sheets…</p>
        </div>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-red-600 font-medium mb-2">Failed to load data</p>
          <p className="text-gray-500 text-sm mb-4">{data.error}</p>
          <button
            onClick={data.refresh}
            className="px-4 py-2 bg-powder-600 text-white rounded-lg hover:bg-powder-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Powder Ops Dashboard</h1>
              <p className="text-sm text-gray-500">Production Analytics · EOD Report Data</p>
            </div>
            <nav className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <tab.icon size={15} />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <FilterBar
          teams={data.teams}
          products={data.products}
          teamFilter={data.teamFilter}
          setTeamFilter={data.setTeamFilter}
          productFilter={data.productFilter}
          setProductFilter={data.setProductFilter}
          dateRange={data.dateRange}
          setDateRange={data.setDateRange}
          lastRefresh={data.lastRefresh}
          onRefresh={data.refresh}
          loading={data.loading}
        />

        <KPICards runs={data.runs} />

        {activeTab === 'production' && <ProductionTab runs={data.runs} />}
        {activeTab === 'efficiency' && <EfficiencyTab runs={data.runs} />}
        {activeTab === 'staffing' && <StaffingTab runs={data.runs} />}
        {activeTab === 'schedule' && <ScheduleTab runs={data.runs} schedule={data.schedule} />}
        {activeTab === 'log' && <RunLog runs={data.runs} />}
      </main>
    </div>
  );
}

export default App;
