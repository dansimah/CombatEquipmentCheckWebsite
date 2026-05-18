'use client';

import { useState, useEffect } from 'react';

interface Soldier {
  id: string;
  name: string;
  verifiedToday?: boolean;
}

interface SoldierSelectorProps {
  team: { id: string; name: string };
  onSelect: (soldier: { id: string; name: string }) => void;
}

export default function SoldierSelector({ team, onSelect }: SoldierSelectorProps) {
  const [soldiers, setSoldiers] = useState<Soldier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/soldiers?teamId=${team.id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then((data) => {
        setSoldiers(data);
        setLoading(false);
      })
      .catch(() => {
        setError('שגיאה בטעינת החיילים');
        setLoading(false);
      });
  }, [team.id]);

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <span>טוען חיילים...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <p style={{ color: 'var(--danger)', textAlign: 'center' }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="card__title">
        <span className="card__title-icon">👤</span>
        בחר חייל — {team.name}
      </h2>
      <div className="form-group">
        <label className="form-label" htmlFor="soldier-select">שם החייל</label>
        <select
          id="soldier-select"
          className="form-select"
          defaultValue=""
          onChange={(e) => {
            const soldier = soldiers.find((s) => s.id === e.target.value);
            if (soldier) onSelect(soldier);
          }}
        >
          <option value="" disabled>
            — בחר חייל —
          </option>
          {soldiers.map((soldier) => (
            <option key={soldier.id} value={soldier.id}>
              {soldier.verifiedToday ? '✔ ' : ''}{soldier.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
