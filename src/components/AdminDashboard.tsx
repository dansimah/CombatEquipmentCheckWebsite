'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatTimestamp, getToday, formatDateDisplay } from '@/lib/utils';

interface SoldierStatus {
  soldierId: string;
  soldierName: string;
  equipmentCount: number;
  verificationStatus: 'full' | 'partial' | 'none';
  verifiedItemCount: number;
  missingItems: string[];
  verificationTime: string | null;
  verified: boolean;
}

interface TeamStatus {
  teamId: string;
  teamName: string;
  soldiers: SoldierStatus[];
  verifiedCount: number;
  partialCount: number;
  totalCount: number;
}

interface StatusData {
  date: string;
  intervalHours: number;
  teams: TeamStatus[];
  summary: {
    totalSoldiers: number;
    totalVerified: number;
    totalPartial: number;
  };
}

export default function AdminDashboard() {
  const [date, setDate] = useState(getToday());
  const [data, setData] = useState<StatusData | null>(null);
  const [summaryData, setSummaryData] = useState<{type: string, total: number, verified: number}[]>([]);
  const [summaryTeam, setSummaryTeam] = useState<string>('');
  const [teamsList, setTeamsList] = useState<{id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const fetchStatus = useCallback(async (selectedDate: string, background = false) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      const statusRes = await fetch(`/api/admin/status?date=${selectedDate}`);
      if (!statusRes.ok) {
        if (statusRes.status === 401) {
          window.location.reload();
          return;
        }
        throw new Error('Failed to fetch status');
      }
      const statusData = await statusRes.json();
      setData(statusData);

      // Extract teams for the filter dropdown
      const fetchedTeams = statusData.teams.map((t: TeamStatus) => ({ id: t.teamId, name: t.teamName }));
      setTeamsList(fetchedTeams);

      // Fetch summary
      const summaryUrl = `/api/admin/summary?date=${selectedDate}${summaryTeam ? `&teamId=${summaryTeam}` : ''}`;
      const summaryRes = await fetch(summaryUrl);
      if (summaryRes.ok) {
        const sumData = await summaryRes.json();
        setSummaryData(sumData.summary);
      }
    } catch {
      if (!background) setError('שגיאה בטעינת הנתונים');
    } finally {
      if (!background) setLoading(false);
    }
  }, [summaryTeam]);

  useEffect(() => {
    fetchStatus(date);
  }, [date, fetchStatus]);

  // Auto-refresh every 30 seconds (background — no loading spinner)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStatus(date, true);
    }, 30000);
    return () => clearInterval(interval);
  }, [date, fetchStatus]);

  const handleSheetsSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/admin/sync', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          window.location.reload();
          return;
        }
        throw new Error(body.error || 'סנכרון נכשל');
      }
      setSyncMessage({
        type: 'success',
        text: body.hasChanges
          ? `סנכרון הושלם: ${body.summary}`
          : 'סנכרון הושלם — אין שינויים',
      });
      await fetchStatus(date);
    } catch (err) {
      setSyncMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'שגיאה בסנכרון מ-Sheets',
      });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 8000);
    }
  };

  return (
    <>
      {/* Header with date picker */}
      <div className="admin-header">
        <h2 className="admin-header__title">
          סטטוס אימות — {formatDateDisplay(date)}
        </h2>
        <div className="date-picker-row">
          <input
            id="date-filter"
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
          <button
            className="btn btn--secondary btn--small"
            onClick={() => fetchStatus(date)}
            title="רענן"
          >
            🔄
          </button>
          <button
            className="btn btn--primary btn--small"
            onClick={handleSheetsSync}
            disabled={syncing}
            title="סנכרן מ-Google Sheets"
          >
            {syncing ? 'מסנכרן...' : '📥 סנכרן מ-Sheets'}
          </button>
        </div>
      </div>

      {syncMessage && (
        <div
          className="card"
          style={{
            marginBottom: 'var(--space-lg)',
            borderColor:
              syncMessage.type === 'success' ? 'var(--success)' : 'var(--danger)',
          }}
        >
          <p
            style={{
              textAlign: 'center',
              color:
                syncMessage.type === 'success' ? 'var(--success)' : 'var(--danger)',
            }}
          >
            {syncMessage.text}
          </p>
        </div>
      )}

      {loading ? (
        <div className="loading-state">
          <div className="spinner" />
          <span>טוען נתונים...</span>
        </div>
      ) : error ? (
        <div className="card">
          <p style={{ color: 'var(--danger)', textAlign: 'center' }}>{error}</p>
        </div>
      ) : data ? (
        <>
          {/* Summary Stats */}
          <div className="admin-stats">
            <div className="stat-card">
              <div className="stat-card__value">{data.summary.totalSoldiers}</div>
              <div className="stat-card__label">סה״כ חיילים</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__value stat-card__value--success">
                {data.summary.totalVerified}
              </div>
              <div className="stat-card__label">אימות מלא ✅</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__value stat-card__value--warning">
                {data.summary.totalPartial}
              </div>
              <div className="stat-card__label">אימות חלקי ⚠️</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__value stat-card__value--danger">
                {data.summary.totalSoldiers - data.summary.totalVerified - data.summary.totalPartial}
              </div>
              <div className="stat-card__label">ממתינים ❌</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__value">
                {data.summary.totalSoldiers > 0
                  ? Math.round(
                      (data.summary.totalVerified / data.summary.totalSoldiers) * 100
                    )
                  : 0}
                %
              </div>
              <div className="stat-card__label">אחוז השלמה</div>
            </div>
          </div>

          {/* Aggregate Equipment Summary */}
          <div className="card" style={{ marginBottom: 'var(--space-2xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
              <h2 className="card__title" style={{ margin: 0 }}>
                <span className="card__title-icon">📦</span>
                סיכום אמצעים
              </h2>
              <select
                className="form-select"
                style={{ width: 'auto', minWidth: '150px' }}
                value={summaryTeam}
                onChange={(e) => setSummaryTeam(e.target.value)}
              >
                <option value="">כל הפלוגה</option>
                {teamsList.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            
            <div className="equipment-summary-grid">
              {summaryData.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>לא נמצא ציוד.</p>
              ) : (
                summaryData.map((item) => (
                  <div key={item.type} className="equipment-summary-item">
                    <div className="equipment-summary-item__name">{item.type}</div>
                    <div className="equipment-summary-item__count">
                      <span className={item.verified === item.total ? 'text-success' : item.verified > 0 ? 'text-warning' : 'text-danger'}>
                        {item.verified}
                      </span>
                      {' '}מתוך{' '}
                      {item.total}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Team Sections */}
          {data.teams.map((team) => (
            <div key={team.teamId} className="team-section">
              <div className="team-section__header">
                <span className="team-section__name">🎖️ {team.teamName}</span>
                <span className="team-section__progress">
                  {team.verifiedCount}/{team.totalCount}
                  {team.partialCount > 0 && ` (${team.partialCount} חלקי)`}
                </span>
              </div>
              <div className="team-section__progress-bar">
                <div
                  className="team-section__progress-fill"
                  style={{
                    width:
                      team.totalCount > 0
                        ? `${((team.verifiedCount + team.partialCount * 0.5) / team.totalCount) * 100}%`
                        : '0%',
                  }}
                />
              </div>
              <div className="team-section__body">
                {team.soldiers.map((soldier) => (
                  <div key={soldier.soldierId} className="soldier-row">
                    <div>
                      <div className="soldier-row__name">{soldier.soldierName}</div>
                      <div className="soldier-row__meta">
                        {soldier.equipmentCount} פריטים
                      </div>
                    </div>
                    <div className="soldier-row__status">
                      {soldier.verificationStatus === 'full' ? (
                        <>
                          <span className="status-badge status-badge--verified">
                            ✅ אומת
                          </span>
                          {soldier.verificationTime && (
                            <span className="verification-time">
                              {formatTimestamp(soldier.verificationTime)}
                            </span>
                          )}
                        </>
                      ) : soldier.verificationStatus === 'partial' ? (
                        <span
                          className="status-badge status-badge--partial"
                          title={`חסר: ${soldier.missingItems.join(', ')}`}
                        >
                          ⚠️ חלקי ({soldier.verifiedItemCount}/{soldier.equipmentCount})
                        </span>
                      ) : (
                        <span className="status-badge status-badge--pending">
                          ❌ ממתין
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      ) : null}
    </>
  );
}
