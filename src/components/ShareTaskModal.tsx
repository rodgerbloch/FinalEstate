import { useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import {
  COLLABORATOR_ROLES,
  type CollaboratorPermission,
  type CollaboratorRole,
  type EstateTask,
} from '../types/estate';

interface ShareTaskModalProps {
  task: EstateTask;
  onClose: () => void;
  onSendInvite: (
    email: string,
    role: CollaboratorRole,
    permission: CollaboratorPermission,
    taskIds: string[]
  ) => Promise<void>;
}

export function ShareTaskModal({ task, onClose, onSendInvite }: ShareTaskModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<CollaboratorRole>('Family Member');
  const [permission, setPermission] = useState<CollaboratorPermission>('View Only');
  const [scope, setScope] = useState<'task' | 'estate'>('task');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setErrorMsg('');
    try {
      await onSendInvite(email, role, permission, scope === 'task' ? [task.id] : []);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to send invitation.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1C2420]/40 flex items-center justify-center p-4">
      <div className="bg-white border border-[#E4DFD3] rounded-xl max-w-md w-full overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E4DFD3] bg-[#FBF9F4] flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-[#1C2420]">
            Share Task &amp; Invite Collaborator
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#56635C] hover:text-[#1C2420] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="p-3 bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg">
            <div className="text-[11px] text-[#56635C]">Selected Task</div>
            <div className="text-sm font-medium text-[#1C2420] mt-0.5">{task.title}</div>
          </div>

          {errorMsg && (
            <div className="p-2.5 text-xs text-[#B42318] bg-[#FEF3F2] border border-[#FECDCA] rounded-lg">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#1C2420] mb-1">
              Collaborator Email *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="advisor@example.com"
              className="w-full px-3 py-2 text-sm bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#1C2420] mb-1">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as CollaboratorRole)}
                className="w-full px-3 py-2 text-xs bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg"
              >
                {COLLABORATOR_ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#1C2420] mb-1">Permission</label>
              <select
                value={permission}
                onChange={(e) => setPermission(e.target.value as CollaboratorPermission)}
                className="w-full px-3 py-2 text-xs bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg"
              >
                <option value="View Only">View Only</option>
                <option value="View & Update">View &amp; Update</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1C2420] mb-1.5">Access Scope</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setScope('task')}
                className={`px-3 py-2 text-xs font-medium rounded-lg border cursor-pointer ${
                  scope === 'task'
                    ? 'bg-[#1B4332] text-white border-[#1B4332]'
                    : 'bg-[#FBF9F4] text-[#4F5B54] border-[#E4DFD3]'
                }`}
              >
                This Task Only
              </button>
              <button
                type="button"
                onClick={() => setScope('estate')}
                className={`px-3 py-2 text-xs font-medium rounded-lg border cursor-pointer ${
                  scope === 'estate'
                    ? 'bg-[#1B4332] text-white border-[#1B4332]'
                    : 'bg-[#FBF9F4] text-[#4F5B54] border-[#E4DFD3]'
                }`}
              >
                Full Estate Ledger
              </button>
            </div>
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
              disabled={sending}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#255742] rounded-lg cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              {sending ? 'Sending...' : 'Send Invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
