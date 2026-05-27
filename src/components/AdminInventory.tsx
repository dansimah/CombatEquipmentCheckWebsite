'use client';

import { useState, useEffect, useCallback } from 'react';
import { EQUIPMENT_TYPES } from '@/lib/equipment-types';
import { getToday, formatDateDisplay } from '@/lib/utils';

interface SummaryItem {
  type: string;
  total: number;
  verified: number;
}

interface InventoryItem {
  equipmentId: string;
  serialNumber: string;
  soldierId: string;
  soldierName: string;
  teamId: string;
  teamName: string;
  verified: boolean;
  verificationId: string | null;
}

interface TeamOption {
  id: string;
  name: string;
}

export default function AdminInventory() {
  const [date, setDate] = useState(getToday());
  const [summaryData, setSummaryData] = useState<SummaryItem[]>([]);
  const [teamsList, setTeamsList] = useState<TeamOption[]>([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drill-down state
  const [drilldownType, setDrilldownType] = useState<string | null>(null);
  const [drilldownItems, setDrilldownItems] = useState<InventoryItem[]>([]);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Fetch overview data
  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch teams list
      const teamsRes = await fetch('/api/teams');
      if (teamsRes.ok) {
        const teamsData = await teamsRes.json();
        setTeamsList(teamsData);
      }

      // Fetch summary
      const params = new URLSearchParams({ date });
      if (selectedTeam) params.set('teamId', selectedTeam);
      const summaryRes = await fetch(`/api/admin/summary?${params}`);
      if (!summaryRes.ok) {
        if (summaryRes.status === 401) {
          window.location.reload();
          return;
        }
        throw new Error('Failed to fetch');
      }
      const data = await summaryRes.json();
      setSummaryData(data.summary);
    } catch {
      setError('שגיאה בטעינת נתוני המלאי');
    } finally {
      setLoading(false);
    }
  }, [date, selectedTeam]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Fetch drill-down data for a specific equipment type
  const fetchDrilldown = async (type: string) => {
    setDrilldownType(type);
    setDrilldownLoading(true);
    try {
      const params = new URLSearchParams({ type, date });
      if (selectedTeam) params.set('teamId', selectedTeam);
      const res = await fetch(`/api/admin/inventory?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setDrilldownItems(data.items);
    } catch {
      showToast('שגיאה בטעינת פרטי הציוד', 'error');
      setDrilldownType(null);
    } finally {
      setDrilldownLoading(false);
    }
  };

  // Manual verify a single item
  const handleVerify = async (item: InventoryItem) => {
    setVerifyingId(item.equipmentId);
    try {
      const res = await fetch('/api/admin/inventory/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          soldierId: item.soldierId,
          equipmentId: item.equipmentId,
          equipmentType: drilldownType,
          serialNumber: item.serialNumber,
        }),
      });
      if (!res.ok) throw new Error('Failed to verify');

      // Update local state
      setDrilldownItems((prev) =>
        prev.map((i) =>
          i.equipmentId === item.equipmentId ? { ...i, verified: true } : i
        )
      );
      showToast(`✅ ${drilldownType} (${item.serialNumber}) אומת בהצלחה`, 'success');

      // Refresh summary counts
      fetchSummary();
    } catch {
      showToast('שגיאה באימות הפריט', 'error');
    } finally {
      setVerifyingId(null);
    }
  };

  // Back to overview
  const handleBack = () => {
    setDrilldownType(null);
    setDrilldownItems([]);
  };

  // Push browser history entry when entering drill-down, handle back button
  useEffect(() => {
    if (drilldownType) {
      window.history.pushState({ adminSubview: 'drilldown' }, '');
    }
  }, [drilldownType]);

  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      if (drilldownType) {
        e.preventDefault();
        setDrilldownType(null);
        setDrilldownItems([]);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [drilldownType]);

  const allTypesWithCounts = (() => {
    const seen = new Set<string>();
    const result: SummaryItem[] = [];

    for (const type of EQUIPMENT_TYPES) {
      seen.add(type);
      const found = summaryData.find((s) => s.type === type);
      result.push({ type, total: found?.total || 0, verified: found?.verified || 0 });
    }

    for (const item of summaryData) {
      if (!seen.has(item.type)) {
        result.push(item);
      }
    }

    return result;
  })();

  // ---- DRILL-DOWN VIEW ----
  if (drilldownType) {
    const verifiedCount = drilldownItems.filter((i) => i.verified).length;
    const totalCount = drilldownItems.length;

    return (
      <div className="inventory-drilldown">
        {toast && (
          <div className={`toast toast--${toast.type}`}>{toast.message}</div>
        )}

        {/* Header */}
        <button
          className="btn btn--secondary btn--small"
          onClick={handleBack}
          style={{ marginBottom: 'var(--space-lg)' }}
        >
          → חזרה למלאי
        </button>

        <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
          <h2 className="card__title">
            <span className="card__title-icon">🔍</span>
            {drilldownType}
          </h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              {formatDateDisplay(date)}
            </span>
            <span className={verifiedCount === totalCount && totalCount > 0 ? 'text-success' : verifiedCount > 0 ? 'text-warning' : 'text-danger'}>
              {verifiedCount} מתוך {totalCount} אומתו
            </span>
          </div>
        </div>

        {drilldownLoading ? (
          <div className="loading-state">
            <div className="spinner" />
            <span>טוען פרטי ציוד...</span>
          </div>
        ) : drilldownItems.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state__icon">📦</div>
              <p>לא נמצאו פריטים מסוג {drilldownType}</p>
            </div>
          </div>
        ) : (
          <div className="inventory-items">
            {drilldownItems.map((item) => (
              <div
                key={item.equipmentId}
                className={`inventory-item ${item.verified ? 'inventory-item--verified' : ''}`}
              >
                <div className="inventory-item__info">
                  <div className="inventory-item__serial">{item.serialNumber}</div>
                  <div className="inventory-item__soldier">
                    👤 {item.soldierName}
                  </div>
                  <div className="inventory-item__team">
                    🎖️ {item.teamName}
                  </div>
                </div>
                <div className="inventory-item__action">
                  {item.verified ? (
                    <span className="status-badge status-badge--verified">✅ אומת</span>
                  ) : (
                    <button
                      className="btn btn--primary btn--small inventory-verify-btn"
                      onClick={() => handleVerify(item)}
                      disabled={verifyingId === item.equipmentId}
                    >
                      {verifyingId === item.equipmentId ? (
                        <><div className="spinner" /> מאמת...</>
                      ) : (
                        '✓ אשר'
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---- OVERVIEW VIEW ----
  return (
    <div className="inventory-overview">
      {toast && (
        <div className={`toast toast--${toast.type}`}>{toast.message}</div>
      )}

      {/* Header with date and filter */}
      <div className="admin-header">
        <h2 className="admin-header__title">
          📦 מלאי ציוד — {formatDateDisplay(date)}
        </h2>
        <div className="date-picker-row">
          <input
            id="inventory-date-filter"
            type="date"
            className="form-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button
            className="btn btn--secondary btn--small"
            onClick={() => setDate(getToday())}
          >
            היום
          </button>
        </div>
      </div>

      {/* Team filter */}
      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <select
          className="form-select"
          style={{ maxWidth: '300px' }}
          value={selectedTeam}
          onChange={(e) => setSelectedTeam(e.target.value)}
        >
          <option value="">כל הפלוגה</option>
          {teamsList.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="spinner" />
          <span>טוען נתוני מלאי...</span>
        </div>
      ) : error ? (
        <div className="card">
          <p style={{ color: 'var(--danger)', textAlign: 'center' }}>{error}</p>
        </div>
      ) : (
        <div className="inventory-grid">
          {allTypesWithCounts.map((item) => {
            const pct = item.total > 0 ? Math.round((item.verified / item.total) * 100) : 0;
            const statusClass =
              item.total === 0
                ? ''
                : item.verified === item.total
                  ? 'inventory-card--complete'
                  : item.verified > 0
                    ? 'inventory-card--partial'
                    : 'inventory-card--none';

            return (
              <div
                key={item.type}
                className={`inventory-card ${statusClass} ${item.total > 0 ? 'inventory-card--clickable' : ''}`}
                onClick={() => item.total > 0 && fetchDrilldown(item.type)}
                role={item.total > 0 ? 'button' : undefined}
                tabIndex={item.total > 0 ? 0 : undefined}
                onKeyDown={(e) => {
                  if (item.total > 0 && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    fetchDrilldown(item.type);
                  }
                }}
              >
                <div className="inventory-card__name">{item.type}</div>
                <div className="inventory-card__count">
                  {item.total > 0 ? (
                    <>
                      <span className="inventory-card__numbers">
                        {item.verified}/{item.total}
                      </span>
                      <div className="inventory-card__bar">
                        <div
                          className="inventory-card__bar-fill"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <span className="inventory-card__empty">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
