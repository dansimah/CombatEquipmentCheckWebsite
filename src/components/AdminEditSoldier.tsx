'use client';

import { useState, useEffect } from 'react';
import { EQUIPMENT_TYPES } from '@/lib/equipment-types';

interface EquipmentItem {
  id: string;
  type: string;
  serialNumber: string;
}

interface SoldierData {
  id: string;
  name: string;
  team: { id: string; name: string };
  equipment: EquipmentItem[];
}

interface TeamOption {
  id: string;
  name: string;
}

interface AdminEditSoldierProps {
  soldierId: string;
  teams: TeamOption[];
  onBack: () => void;
  onSaved: () => void;
  onDelete: (id: string, name: string) => void;
}

export default function AdminEditSoldier({
  soldierId,
  teams,
  onBack,
  onSaved,
  onDelete,
}: AdminEditSoldierProps) {
  const [soldier, setSoldier] = useState<SoldierData | null>(null);
  const [name, setName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Record<string, { type: string; serialNumber: string }>>({});
  const [newEquipment, setNewEquipment] = useState({ type: '', serialNumber: '' });
  const [addingEquipment, setAddingEquipment] = useState(false);
  const [dbTypes, setDbTypes] = useState<string[]>([]);

  const allTypes = Array.from(new Set([...EQUIPMENT_TYPES, ...dbTypes]));

  useEffect(() => {
    fetchSoldier();
    fetch('/api/admin/equipment-types')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setDbTypes(data); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soldierId]);

  const fetchSoldier = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/soldiers/${soldierId}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setSoldier(data);
      setName(data.name);
      setTeamId(data.team.id);
    } catch {
      // error handled by loading state
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDetails = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/soldiers/${soldierId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, teamId }),
      });
      if (!res.ok) throw new Error('Failed');
      const updated = await res.json();
      setSoldier(updated);
      onSaved();
    } catch {
      alert('שגיאה בשמירת הפרטים');
    } finally {
      setSaving(false);
    }
  };

  const startEditEquipment = (item: EquipmentItem) => {
    setEditingEquipment((prev) => ({
      ...prev,
      [item.id]: { type: item.type, serialNumber: item.serialNumber },
    }));
  };

  const cancelEditEquipment = (itemId: string) => {
    setEditingEquipment((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const saveEquipment = async (itemId: string) => {
    const edit = editingEquipment[itemId];
    if (!edit) return;

    try {
      const res = await fetch(`/api/admin/soldiers/${soldierId}/equipment`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          equipmentId: itemId,
          type: edit.type,
          serialNumber: edit.serialNumber,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      cancelEditEquipment(itemId);
      fetchSoldier();
      onSaved();
    } catch {
      alert('שגיאה בעדכון הציוד');
    }
  };

  const deleteEquipment = async (itemId: string, itemType: string) => {
    if (!confirm(`האם להסיר ${itemType}?`)) return;

    try {
      const res = await fetch(`/api/admin/soldiers/${soldierId}/equipment`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipmentId: itemId }),
      });
      if (!res.ok) throw new Error('Failed');
      fetchSoldier();
      onSaved();
    } catch {
      alert('שגיאה במחיקת הציוד');
    }
  };

  const addEquipment = async () => {
    if (!newEquipment.type.trim() || !newEquipment.serialNumber.trim()) return;
    setAddingEquipment(true);

    try {
      const res = await fetch(`/api/admin/soldiers/${soldierId}/equipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEquipment),
      });
      if (!res.ok) throw new Error('Failed');
      setNewEquipment({ type: '', serialNumber: '' });
      fetchSoldier();
      onSaved();
    } catch {
      alert('שגיאה בהוספת ציוד');
    } finally {
      setAddingEquipment(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <span>טוען פרטי חייל...</span>
      </div>
    );
  }

  if (!soldier) {
    return (
      <div className="card">
        <p style={{ color: 'var(--danger)', textAlign: 'center' }}>חייל לא נמצא</p>
      </div>
    );
  }

  return (
    <div className="edit-soldier">
      {/* Back Button */}
      <button className="btn btn--secondary btn--small" onClick={onBack} style={{ marginBottom: 'var(--space-lg)' }}>
        → חזרה לרשימה
      </button>

      {/* Soldier Details Card */}
      <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
        <h2 className="card__title">
          <span className="card__title-icon">👤</span>
          פרטי חייל
        </h2>

        <div className="form-group">
          <label className="form-label" htmlFor="edit-name">שם</label>
          <input
            id="edit-name"
            type="text"
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>



        <div className="form-group">
          <label className="form-label" htmlFor="edit-team">צוות</label>
          <select
            id="edit-team"
            className="form-select"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
          <button
            className="btn btn--primary"
            onClick={handleSaveDetails}
            disabled={saving || !name.trim()}
            style={{ flex: 1 }}
          >
            {saving ? <><div className="spinner" /> שומר...</> : '💾 שמור שינויים'}
          </button>
          <button
            className="btn btn--danger"
            onClick={() => onDelete(soldier.id, soldier.name)}
            style={{ flexShrink: 0 }}
          >
            🗑️ מחק
          </button>
        </div>
      </div>

      {/* Equipment Card */}
      <div className="card">
        <h2 className="card__title">
          <span className="card__title-icon">🔫</span>
          ציוד ({soldier.equipment.length} פריטים)
        </h2>

        <div className="equipment-list">
          {soldier.equipment.map((item) => {
            const isEditing = editingEquipment[item.id];
            return (
              <div key={item.id} className="equipment-list-item">
                {isEditing ? (
                  <>
                    <div className="equipment-list-item__fields">
                      <input
                        type="text"
                        className="form-input"
                        list="equipment-types-list"
                        placeholder="— בחר או הקלד פריט —"
                        value={isEditing.type}
                        onChange={(e) =>
                          setEditingEquipment((prev) => ({
                            ...prev,
                            [item.id]: { ...prev[item.id], type: e.target.value },
                          }))
                        }
                      />
                      <input
                        type="text"
                        className="form-input"
                        value={isEditing.serialNumber}
                        onChange={(e) =>
                          setEditingEquipment((prev) => ({
                            ...prev,
                            [item.id]: { ...prev[item.id], serialNumber: e.target.value },
                          }))
                        }
                        style={{ direction: 'ltr', textAlign: 'right' }}
                      />
                    </div>
                    <div className="equipment-list-item__actions">
                      <button
                        className="btn btn--primary btn--small"
                        onClick={() => saveEquipment(item.id)}
                      >
                        ✓
                      </button>
                      <button
                        className="btn btn--secondary btn--small"
                        onClick={() => cancelEditEquipment(item.id)}
                      >
                        ✕
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="equipment-list-item__info">
                      <span className="equipment-list-item__type">{item.type}</span>
                      <span className="equipment-list-item__serial">{item.serialNumber}</span>
                    </div>
                    <div className="equipment-list-item__actions">
                      <button
                        className="btn btn--secondary btn--small"
                        onClick={() => startEditEquipment(item)}
                        title="ערוך"
                      >
                        ✏️
                      </button>
                      <button
                        className="btn btn--danger btn--small"
                        onClick={() => deleteEquipment(item.id, item.type)}
                        title="מחק"
                      >
                        🗑️
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Add New Equipment */}
        <div className="add-equipment-row">
          <h3 className="add-equipment-row__title">הוסף ציוד חדש</h3>
          <div className="equipment-row__fields">
            <input
              type="text"
              className="form-input"
              list="equipment-types-list"
              placeholder="— בחר או הקלד פריט —"
              value={newEquipment.type}
              onChange={(e) => setNewEquipment((prev) => ({ ...prev, type: e.target.value }))}
            />
            <input
              type="text"
              className="form-input"
              placeholder="מספר סידורי"
              value={newEquipment.serialNumber}
              onChange={(e) => setNewEquipment((prev) => ({ ...prev, serialNumber: e.target.value }))}
              style={{ direction: 'ltr', textAlign: 'right' }}
            />
          </div>
          <button
            className="btn btn--primary btn--small"
            onClick={addEquipment}
            disabled={!newEquipment.type.trim() || !newEquipment.serialNumber.trim() || addingEquipment}
            style={{ marginTop: 'var(--space-sm)' }}
          >
            {addingEquipment ? <><div className="spinner" /> מוסיף...</> : '➕ הוסף'}
          </button>
        </div>

        <datalist id="equipment-types-list">
          {allTypes.map((type) => (
            <option key={type} value={type} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
