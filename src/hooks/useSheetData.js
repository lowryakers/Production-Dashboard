import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchSheetData, getTeams, getProducts } from '../utils/parseSheet';

export function useSheetData() {
  const [allRuns, setAllRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const [teamFilter, setTeamFilter] = useState('All');
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [productFilter, setProductFilter] = useState('All');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const runs = await fetchSheetData();
      setAllRuns(runs);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const runs = useMemo(() => {
    return allRuns.filter((r) => {
      if (teamFilter !== 'All' && r.team !== teamFilter) return false;
      if (productFilter !== 'All' && r.product !== productFilter) return false;
      if (dateRange.start && r.date < dateRange.start) return false;
      if (dateRange.end && r.date > dateRange.end) return false;
      return true;
    });
  }, [allRuns, teamFilter, dateRange, productFilter]);

  const teams = useMemo(() => getTeams(allRuns), [allRuns]);
  const products = useMemo(() => getProducts(allRuns), [allRuns]);

  return {
    runs,
    allRuns,
    loading,
    error,
    lastRefresh,
    refresh: loadData,
    teams,
    products,
    teamFilter,
    setTeamFilter,
    dateRange,
    setDateRange,
    productFilter,
    setProductFilter,
  };
}
