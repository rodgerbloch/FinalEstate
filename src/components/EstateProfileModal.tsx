import { useState } from 'react';
import { X } from 'lucide-react';
import type { Estate } from '../types/estate';

interface EstateProfileModalProps {
  estate: Estate;
  onClose: () => void;
  onSave: (updates: { title: string; principalName: string; notes: string }) => Promise<void>;
}

export function EstateProfileModal({ estate, onClose, onSave }: EstateProfileModalProps) {
  const [title, setTitle] = useState(estate.title);
  const [principalName, setPrincipalName] = useState(estate.principalName);
  const [notes, setNotes] = useState(estate.notes);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !principalName.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        principalName: principalName.trim(),
        notes: notes.trim(),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1C2420]/40 flex items-center justify-center p-4">
      <div className="bg-white border border-[#E4DFD3] rounded-xl max-w-lg w-full overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E4DFD3] bg-[#FBF9F4] flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-[#1C2420]">
            Estate Profile Details
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#56635C] hover:text-[#1C2420] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#1C2420] mb-1">
              Estate Ledger Title *
            </label>
            <input
              type="text"
              required
              maxLength={140}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#1C2420] mb-1">
              Principal Name *
            </label>
            <input
              type="text"
              required
              maxLength={120}
              value={principalName}
              onChange={(e) => setPrincipalName(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#1C2420] mb-1">
              General Executor Guidance / Estate Notes
            </label>
            <textarea
              rows={3}
              maxLength={5000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg"
            />
          </div>
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-[#4F5B54] border border-[#E4DFD3] rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium text-white bg-[#1B4332] rounded-lg cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
