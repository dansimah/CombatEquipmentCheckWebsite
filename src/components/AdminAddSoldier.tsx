'use client';

import { useState, useEffect, FormEvent } from 'react';
import { EQUIPMENT_TYPES } from '@/lib/equipment-types';

interface TeamOption {
  id: string;
  name: string;
}

interface EquipmentRow {
  type: string;
  serialNumber: string;
}

export default function AdminAddSoldier() {
  const [name, setName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [equipment, setEquipment] = useState<EquipmentRow[]>([
    { type: '', serialNumber: '' },
  ]);
  const [dbTypes, setDbTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Fetch teams and equipment types on mount
  useEffect(() => {
    fetch('/api/teams')
      .then((r) => r.json())
      .then((data) => setTeams(data))
      .catch(() => {});

    fetch('/api/admin/equipment-types')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setDbTypes(data);
      })
      .catch(() => {});
  }, []);

  // Merge config types with DB types for suggestions
  const allTypes = Array.from(new Set([...EQUIPMENT_TYPES, ...dbTypes]));

  const addEquipmentRow = () => {
    setEquipment((prev) => [...prev, { type: '', serialNumber: '' }]);
  };

  const removeEquipmentRow = (index: number) => {
    setEquipment((prev) => prev.filter((_, i) => i !== index));
  };

  const updateEquipmentRow = (index: number, field: keyof EquipmentRow, value: string) => {
    setEquipment((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  const resetForm = () => {
    setName('');
    setTeamId('');
    setEquipment([{ type: '', serialNumber: '' }]);
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !teamId) return;

    setLoading(true);
    try {
      const validEquipment = equipment.filter(
        (e) => e.type.trim() && e.serialNumber.trim()
      );

      const res = await fetch('/api/admin/soldiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          teamId,
          equipment: validEquipment,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create soldier');
      }

      const soldier = await res.json();
      showToast(`✅ ${soldier.name} נוסף בהצלחה!`, 'success');
      resetForm();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'שגיאה ביצירת חייל',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-add-soldier">
      {/* Toast Notification */}
      {toast && (
        <div className={`toast toast--${toast.type}`}>
          {toast.message}
        </div>
      )}

      <div className="card">
        <h2 className="card__title">
          <span className="card__title-icon">➕</span>
          הוספת חייל חדש
        </h2>

        <form onSubmit={handleSubmit}>
          {/* Soldier Name */}
          <div className="form-group">
            <label className="form-label" htmlFor="soldier-name">
              שם החייל *
            </label>
            <input
              id="soldier-name"
              type="text"
              className="form-input"
              placeholder="הזן שם מלא"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>



          {/* Team Selection */}
          <div className="form-group">
            <label className="form-label" htmlFor="soldier-team">
              צוות *
            </label>
            <select
              id="soldier-team"
              className="form-select"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              required
            >
              <option value="">בחר צוות...</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>

          {/* Equipment Section */}
          <div className="form-group">
            <div className="equipment-section-header">
              <label className="form-label">ציוד</label>
              <button
                type="button"
                className="btn btn--secondary btn--small"
                onClick={addEquipmentRow}
              >
                ➕ הוסף פריט
              </button>
            </div>

            <div className="equipment-rows">
              {equipment.map((row, index) => (
                <div key={index} className="equipment-row">
                  <div className="equipment-row__fields">
                    <input
                      type="text"
                      className="form-input"
                      list="equipment-types-list"
                      placeholder="— בחר או הקלד פריט —"
                      value={row.type}
                      onChange={(e) =>
                        updateEquipmentRow(index, 'type', e.target.value)
                      }
                    />
                    <input
                      type="text"
                      className="form-input"
                      placeholder="מספר סידורי"
                      value={row.serialNumber}
                      onChange={(e) =>
                        updateEquipmentRow(index, 'serialNumber', e.target.value)
                      }
                      style={{ direction: 'ltr', textAlign: 'right' }}
                    />
                  </div>
                  {equipment.length > 1 && (
                    <button
                      type="button"
                      className="btn btn--danger btn--small equipment-row__remove"
                      onClick={() => removeEquipmentRow(index)}
                      title="הסר פריט"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <datalist id="equipment-types-list">
            {allTypes.map((type) => (
              <option key={type} value={type} />
            ))}
          </datalist>

          {/* Submit */}
          <button
            type="submit"
            className="btn btn--primary"
            disabled={!name.trim() || !teamId || loading}
          >
            {loading ? (
              <>
                <div className="spinner" />
                שומר...
              </>
            ) : (
              '💾 שמור חייל'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
