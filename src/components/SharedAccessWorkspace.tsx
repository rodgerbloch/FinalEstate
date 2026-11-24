import { useState } from 'react';
import { Check, Shield, Trash2, UserPlus, Users, X } from 'lucide-react';
import {
  COLLABORATOR_ROLES,
  type CollaboratorPermission,
  type CollaboratorRole,
  type Estate,
  type EstateMember,
  type EstateTask,
  type Invitation,
} from '../types/estate';

interface SharedAccessWorkspaceProps {
  estate: Estate;
  isOwner: boolean;
  tasks: EstateTask[];
  members: EstateMember[];
  outgoingInvitations: Invitation[];
  incomingInvitations: Invitation[];
  onSendInvite: (
    email: string,
    role: CollaboratorRole,
    permission: CollaboratorPermission,
    taskIds: string[]
  ) => Promise<void>;
  onUpdateInvite: (
    invite: Invitation,
    role: CollaboratorRole,
    permission: CollaboratorPermission
  ) => Promise<void>;
  onRevokeInvite: (invite: Invitation) => Promise<void>;
  onAcceptIncoming: (invite: Invitation) => Promise<void>;
  onDeclineIncoming: (invite: Invitation) => Promise<void>;
  onSwitchEstate: (estateId: string) => void;
}

export function SharedAccessWorkspace({
  estate,
  isOwner,
  tasks,
  members,
  outgoingInvitations,
  incomingInvitations,
  onSendInvite,
  onUpdateInvite,
  onRevokeInvite,
  onAcceptIncoming,
  onDeclineIncoming,
  onSwitchEstate,
}: SharedAccessWorkspaceProps) {
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<CollaboratorRole>('Family Member');
  const [invitePerm, setInvitePerm] = useState<CollaboratorPermission>('View & Update');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [sending, setSending] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setInviteError('');
    setInviteSuccess('');
    try {
      await onSendInvite(
        inviteEmail,
        inviteRole,
        invitePerm,
        selectedTaskId ? [selectedTaskId] : []
      );
      setInviteSuccess(`Invitation sent to ${inviteEmail.trim().toLowerCase()}`);
      setInviteEmail('');
      setSelectedTaskId('');
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Unable to send invitation.');
    } finally {
      setSending(false);
    }
  };

  const pendingIncoming = incomingInvitations.filter((i) => i.status === 'pending');
  const acceptedIncoming = incomingInvitations.filter((i) => i.status === 'accepted');
  const activeOutgoing = outgoingInvitations.filter(
    (i) => i.estateId === estate.id && i.status !== 'revoked'
  );

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Incoming Invitations */}
      <section className="bg-white border border-[#E4DFD3] rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-[#1C2420]">
              Shared Access &amp; Collaborators
            </h1>
            <p className="text-sm text-[#56635C] mt-1">
              Coordinate securely with family members, co-executors, legal counsel, and financial advisors.
            </p>
          </div>
        </div>

        {pendingIncoming.length > 0 && (
          <div className="pt-2 space-y-3">
            <h2 className="text-xs font-semibold text-[#9C7832]">
              Pending Incoming Invitations ({pendingIncoming.length})
            </h2>
            <div className="space-y-2.5">
              {pendingIncoming.map((inv) => (
                <div
                  key={inv.id}
                  className="p-4 bg-[#FEF7EC] border border-[#F3DFC1] rounded-lg flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="space-y-0.5">
                    <div className="text-sm font-semibold text-[#1C2420]">{inv.estateTitle}</div>
                    <div className="text-xs text-[#56635C]">
                      Invited by {inv.ownerName} · Role: <span className="font-medium text-[#1C2420]">{inv.role}</span> · Access:{' '}
                      <span className="font-medium text-[#1C2420]">{inv.permission}</span>
                      {inv.taskIds.length > 0 && ` · ${inv.taskIds.length} specific task(s)`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onAcceptIncoming(inv)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#255742] rounded-lg cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeclineIncoming(inv)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-[#4F5B54] bg-white border border-[#E4DFD3] hover:bg-[#F4EFE4] rounded-lg cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {acceptedIncoming.length > 0 && (
          <div className="pt-2 space-y-2.5">
            <h2 className="text-xs font-semibold text-[#1C2420]">
              Shared Ledgers You Can Open
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {acceptedIncoming.map((inv) => (
                <div
                  key={inv.id}
                  className="p-3.5 bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#1C2420] truncate">
                      {inv.estateTitle}
                    </div>
                    <div className="text-xs text-[#56635C]">
                      {inv.role} · {inv.permission}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSwitchEstate(inv.estateId)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap cursor-pointer ${
                      estate.id === inv.estateId
                        ? 'bg-[#1B4332] text-white border-[#1B4332]'
                        : 'bg-white text-[#1B4332] border-[#E4DFD3] hover:bg-[#F4EFE4]'
                    }`}
                  >
                    {estate.id === inv.estateId ? 'Active' : 'Open Ledger'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Invite Collaborator Form (Owner Only) */}
      {isOwner ? (
        <section className="bg-white border border-[#E4DFD3] rounded-xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-[#1B4332]" />
            <h2 className="font-display text-lg font-semibold text-[#1C2420]">
              Invite a Family Member, Co-Executor, or Advisor
            </h2>
          </div>

          <form onSubmit={handleInviteSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#1C2420] mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="coexecutor@example.com"
                  className="w-full px-3 py-2 text-xs bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C2420] mb-1">Role Label</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as CollaboratorRole)}
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
                  value={invitePerm}
                  onChange={(e) => setInvitePerm(e.target.value as CollaboratorPermission)}
                  className="w-full px-3 py-2 text-xs bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg"
                >
                  <option value="View & Update">View &amp; Update</option>
                  <option value="View Only">View Only</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C2420] mb-1">Access Scope</label>
                <select
                  value={selectedTaskId}
                  onChange={(e) => setSelectedTaskId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg"
                >
                  <option value="">Whole Estate Ledger</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      Task: {t.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-[#56635C]">
                Invitees sign in with Google using the invited email address to accept access.
              </span>
              <button
                type="submit"
                disabled={sending}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#255742] rounded-lg whitespace-nowrap cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                {sending ? 'Sending...' : 'Send Invitation'}
              </button>
            </div>

            {inviteError && (
              <div className="p-2.5 text-xs text-[#B42318] bg-[#FEF3F2] border border-[#FECDCA] rounded-lg">
                {inviteError}
              </div>
            )}
            {inviteSuccess && (
              <div className="p-2.5 text-xs text-[#1B5E3A] bg-[#ECFDF3] border border-[#ABEFC6] rounded-lg">
                {inviteSuccess}
              </div>
            )}
          </form>
        </section>
      ) : (
        <section className="bg-[#FBF9F4] border border-[#E4DFD3] rounded-xl p-5 text-sm text-[#56635C] flex items-center gap-3">
          <Shield className="w-4 h-4 text-[#1B4332] shrink-0" />
          <span>
            You are viewing <strong className="text-[#1C2420]">{estate.title}</strong> as a collaborator. Only the estate owner ({estate.ownerName}) can invite or revoke collaborators.
          </span>
        </section>
      )}

      {/* Outgoing Invitations & Active Collaborators */}
      {isOwner && (
        <section className="bg-white border border-[#E4DFD3] rounded-xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-[#1C2420] inline-flex items-center gap-2">
              <Users className="w-4 h-4 text-[#1B4332]" />
              Outgoing Invitations &amp; Active Access ({activeOutgoing.length})
            </h2>
          </div>

          {activeOutgoing.length === 0 ? (
            <p className="text-sm text-[#56635C]">
              No collaborators invited yet for {estate.title}.
            </p>
          ) : (
            <div className="divide-y divide-[#EFECE4] border border-[#E4DFD3] rounded-lg">
              {activeOutgoing.map((inv) => {
                const activeMember = members.find((m) => m.invitationId === inv.id);
                return (
                  <div
                    key={inv.id}
                    className="p-4 flex flex-wrap items-center justify-between gap-4"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="text-sm font-medium text-[#1C2420]">
                        {activeMember?.displayName || inv.inviteeEmail}
                      </div>
                      <div className="text-xs text-[#56635C]">
                        {inv.inviteeEmail} ·{' '}
                        <span
                          className={
                            inv.status === 'accepted'
                              ? 'text-[#1B5E3A] font-medium'
                              : inv.status === 'declined'
                              ? 'text-[#B42318]'
                              : 'text-[#B45309] font-medium'
                          }
                        >
                          {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                        </span>
                        {inv.taskIds.length > 0
                          ? ` · ${inv.taskIds.length} task(s)`
                          : ' · Whole Estate'}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={inv.role}
                        disabled={inv.status === 'declined'}
                        onChange={(e) =>
                          onUpdateInvite(inv, e.target.value as CollaboratorRole, inv.permission)
                        }
                        aria-label="Collaborator role"
                        className="px-2.5 py-1.5 text-xs bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg"
                      >
                        {COLLABORATOR_ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>

                      <select
                        value={inv.permission}
                        disabled={inv.status === 'declined'}
                        onChange={(e) =>
                          onUpdateInvite(inv, inv.role, e.target.value as CollaboratorPermission)
                        }
                        aria-label="Collaborator permission"
                        className="px-2.5 py-1.5 text-xs bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg"
                      >
                        <option value="View & Update">View &amp; Update</option>
                        <option value="View Only">View Only</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => onRevokeInvite(inv)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#B42318] border border-[#FECDCA] bg-[#FEF3F2] hover:bg-[#FEE4E2] rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Revoke
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
