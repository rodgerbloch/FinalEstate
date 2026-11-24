# Estate Ledger Security Specification

## 1. Data Invariants
1. **User Profile Isolation**: A user can only read or write their own `/users/{userId}` document (`request.auth.uid == userId`). No user can list `/users`.
2. **Estate Ownership**: Every `/estates/{estateId}` document must have `ownerId == request.auth.uid` on creation, and `ownerId` and `createdAt` are immutable forever.
3. **Master Gate Membership**: Access to `/estates/{estateId}/tasks` and `/estates/{estateId}/documents` is restricted strictly to the estate owner or a verified member present in `/estates/{estateId}/members/{request.auth.uid}`. Revoking a member synchronously terminates subcollection access.
4. **Tiered Collaborator Permissions**: A member with `permission == 'View Only'` can read estate tasks and documents but is strictly blocked from creating, updating, or deleting tasks or documents. A member with `permission == 'View & Update'` can create/update tasks and upload/update documents, and cannot delete the estate or modify other members.
5. **Invitation Integrity & Anti-Escalation**: An invitee can only accept an invitation addressed to their verified email (`request.auth.token.email_verified == true && inviteeEmail == request.auth.token.email.lower()`), must atomically create `/estates/{estateId}/members/{request.auth.uid}` with the exact `role` and `permission` defined on the invitation, and cannot self-escalate from `View Only` to `View & Update`.
6. **Terminal State Locking**: Invitations in `declined` or `revoked` states cannot transition back to `pending` or `accepted`.
7. **Strict Timestamps & Size Bounds**: `createdAt` and `updatedAt` must match `request.time`. All IDs match `^[a-zA-Z0-9_\-]+$` (<= 128 chars). All strings and arrays have strict max sizes.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Ghost Field Shadow Update**: Updating a task with `{ title: "New", isAdmin: true }` -> Rejected by `hasOnly` key whitelist.
2. **Owner Spoofing on Estate Create**: Creating `/estates/e1` with `ownerId: "victim-uid"` -> Rejected by `incoming().ownerId == request.auth.uid`.
3. **Immortal Field Mutation**: Updating `/estates/e1` to change `ownerId` or `createdAt` -> Rejected by immutability checks.
4. **Unverified Email Spoof on Invitation Accept**: Accepting `/invitations/i1` when `request.auth.token.email_verified == false` -> Rejected by `email_verified == true`.
5. **Privilege Escalation on Member Create**: Invitee with `View Only` invitation creating `/estates/e1/members/{uid}` with `permission: "View & Update"` -> Rejected by matching `get(...invitation).data.permission`.
6. **View-Only Write Attempt**: Collaborator with `View Only` calling `update` on `/estates/e1/tasks/t1` -> Rejected by `canEditEstate(estateId)`.
7. **ID Poisoning**: Creating `/estates/../../bad` or a 500-char ID -> Rejected by `isValidId()`.
8. **Type / Value Poisoning**: Updating `sizeBytes` on a document to a string or negative number, or `sha256` to `"abc"` -> Rejected by `isValidVaultDocument()`.
9. **Terminal State Reversal**: Attempting to change an invitation from `revoked` back to `accepted` -> Rejected by state machine check.
10. **Orphaned Task Creation**: Creating `/estates/nonexistent/tasks/t1` -> Rejected by `exists(/databases/$(database)/documents/estates/$(estateId))`.
11. **Backdated Timestamp Attack**: Creating a task with `createdAt: Timestamp(2020-01-01)` -> Rejected by `incoming().createdAt == request.time`.
12. **Blanket List Scraping**: Listing `/invitations` or `/estates` without matching `ownerId` or `inviteeEmail` -> Rejected by `resource.data` list enforcement.
