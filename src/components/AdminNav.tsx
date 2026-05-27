'use client';

interface AdminNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  { id: 'status', label: '📊 סטטוס', icon: '📊' },
  { id: 'inventory', label: '📦 מלאי', icon: '📦' },
];

export default function AdminNav({ activeTab, onTabChange }: AdminNavProps) {
  return (
    <nav className="admin-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`admin-tab ${activeTab === tab.id ? 'admin-tab--active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
