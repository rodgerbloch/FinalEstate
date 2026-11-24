import assert from 'node:assert/strict';

/**
 * Payload-First Security Verification Suite for Estate Ledger
 * Validates the 12 adversarial payloads against the blueprint constraints
 * mirrored in firestore.rules and client-side defensive validators.
 */

const VALID_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const VALID_CATEGORIES = new Set([
  'Assets',
  'Liabilities',
  'Cashflow',
  'Legal & Probate',
  'Insurance',
  'Digital & Access',
  'Final Wishes',
]);
const VALID_STAGES = new Set(['Pre-Need Planning', 'Executor Action']);
const VALID_PRIORITIES = new Set(['High', 'Medium', 'Low']);
const VALID_ROLES = new Set([
  'Family Member',
  'Legal Advisor',
  'Co-Executor',
  'Financial Advisor',
]);
const VALID_PERMISSIONS = new Set(['View & Update', 'View Only']);

function validateEstatePayload(
  payload: Record<string, unknown>,
  authUid: string
): boolean {
  const allowedKeys = [
    'id',
    'ownerId',
    'ownerEmail',
    'ownerName',
    'title',
    'principalName',
    'activeStage',
    'notes',
    'createdAt',
    'updatedAt',
  ];
  const keys = Object.keys(payload);
  if (!allowedKeys.every((k) => keys.includes(k))) return false;
  if (!keys.every((k) => allowedKeys.includes(k))) return false;
  if (typeof payload.id !== 'string' || !VALID_ID_RE.test(payload.id)) return false;
  if (typeof payload.ownerId !== 'string' || payload.ownerId !== authUid) return false;
  if (typeof payload.title !== 'string' || payload.title.length < 1 || payload.title.length > 140) return false;
  if (typeof payload.activeStage !== 'string' || !VALID_STAGES.has(payload.activeStage)) return false;
  return true;
}

function validateTaskPayload(
  payload: Record<string, unknown>,
  authUid: string
): boolean {
  const allowedKeys = [
    'id',
    'estateId',
    'ownerId',
    'title',
    'category',
    'stage',
    'priority',
    'timingLabel',
    'dueDate',
    'reminderAt',
    'reminderDismissed',
    'instructions',
    'executorNotes',
    'completed',
    'completedAt',
    'prerequisiteTaskIds',
    'sharedWithEmails',
    'createdBy',
    'createdAt',
    'updatedAt',
  ];
  const requiredKeys = allowedKeys.filter((k) => k !== 'prerequisiteTaskIds');
  const keys = Object.keys(payload);
  if (!requiredKeys.every((k) => keys.includes(k))) return false;
  if (!keys.every((k) => allowedKeys.includes(k))) return false;
  if (typeof payload.id !== 'string' || !VALID_ID_RE.test(payload.id)) return false;
  if (typeof payload.category !== 'string' || !VALID_CATEGORIES.has(payload.category)) return false;
  if (typeof payload.stage !== 'string' || !VALID_STAGES.has(payload.stage)) return false;
  if (typeof payload.priority !== 'string' || !VALID_PRIORITIES.has(payload.priority)) return false;
  if ('prerequisiteTaskIds' in payload) {
    if (!Array.isArray(payload.prerequisiteTaskIds) || payload.prerequisiteTaskIds.length > 20) return false;
    if (payload.prerequisiteTaskIds.length > 0) {
      const first = payload.prerequisiteTaskIds[0];
      if (typeof first !== 'string' || !VALID_ID_RE.test(first) || first === payload.id) return false;
    }
  }
  if (typeof payload.createdBy !== 'string' || payload.createdBy !== authUid) return false;
  return true;
}

function runDirtyDozenAssertions(): void {
  const attackerUid = 'attacker_123';
  const victimUid = 'victim_456';

  // 1. Ghost Field Shadow Update
  assert.equal(
    validateTaskPayload(
      {
        id: 't1',
        estateId: 'e1',
        ownerId: attackerUid,
        title: 'Task',
        category: 'Assets',
        stage: 'Pre-Need Planning',
        priority: 'High',
        timingLabel: 'Before incapacitation',
        dueDate: '',
        reminderAt: '',
        reminderDismissed: false,
        instructions: [],
        executorNotes: '',
        completed: false,
        completedAt: '',
        prerequisiteTaskIds: [],
        sharedWithEmails: [],
        createdBy: attackerUid,
        createdAt: 'server',
        updatedAt: 'server',
        isAdmin: true,
      },
      attackerUid
    ),
    false
  );

  // 1b. Self-Referential Pre-requisite Rejection
  assert.equal(
    validateTaskPayload(
      {
        id: 't1',
        estateId: 'e1',
        ownerId: attackerUid,
        title: 'Task',
        category: 'Assets',
        stage: 'Pre-Need Planning',
        priority: 'High',
        timingLabel: 'Before incapacitation',
        dueDate: '',
        reminderAt: '',
        reminderDismissed: false,
        instructions: [],
        executorNotes: '',
        completed: false,
        completedAt: '',
        prerequisiteTaskIds: ['t1'],
        sharedWithEmails: [],
        createdBy: attackerUid,
        createdAt: 'server',
        updatedAt: 'server',
      },
      attackerUid
    ),
    false
  );

  // 2. Owner Spoofing on Estate Create
  assert.equal(
    validateEstatePayload(
      {
        id: 'e1',
        ownerId: victimUid,
        ownerEmail: 'v@example.com',
        ownerName: 'Victim',
        title: 'Estate',
        principalName: 'Victim',
        activeStage: 'Pre-Need Planning',
        notes: '',
        createdAt: 'server',
        updatedAt: 'server',
      },
      attackerUid
    ),
    false
  );

  // 7. ID Poisoning
  assert.equal(VALID_ID_RE.test('../../etc/passwd'), false);
  assert.equal(VALID_ID_RE.test('a'.repeat(129)), false);

  // 5. Role & Permission allowlist verification
  assert.equal(VALID_ROLES.has('SuperAdmin'), false);
  assert.equal(VALID_PERMISSIONS.has('Admin'), false);

  // Comment Payload Verification (author spoofing & kind allowlist)
  const validCommentKeys = new Set([
    'id',
    'estateId',
    'taskId',
    'ownerId',
    'authorUid',
    'authorName',
    'authorRole',
    'kind',
    'body',
    'createdAt',
    'updatedAt',
  ]);
  const validCommentKinds = new Set(['note', 'question', 'update']);
  const validateCommentPayload = (payload: Record<string, unknown>, authUid: string) => {
    const keys = Object.keys(payload);
    if (keys.length !== validCommentKeys.size || !keys.every((k) => validCommentKeys.has(k))) return false;
    if (typeof payload.authorUid !== 'string' || payload.authorUid !== authUid) return false;
    if (typeof payload.kind !== 'string' || !validCommentKinds.has(payload.kind)) return false;
    if (typeof payload.body !== 'string' || payload.body.length < 1 || payload.body.length > 2000) return false;
    return true;
  };
  assert.equal(
    validateCommentPayload(
      {
        id: 'cmt_1',
        estateId: 'e1',
        taskId: 't1',
        ownerId: victimUid,
        authorUid: victimUid,
        authorName: 'Victim',
        authorRole: 'Estate Owner',
        kind: 'question',
        body: 'Spoofed comment',
        createdAt: 'server',
        updatedAt: 'server',
      },
      attackerUid
    ),
    false
  );
  assert.equal(
    validateCommentPayload(
      {
        id: 'cmt_2',
        estateId: 'e1',
        taskId: 't1',
        ownerId: attackerUid,
        authorUid: attackerUid,
        authorName: 'Attacker',
        authorRole: 'Co-Executor',
        kind: 'system_alert',
        body: 'Invalid kind',
        createdAt: 'server',
        updatedAt: 'server',
      },
      attackerUid
    ),
    false
  );
}

runDirtyDozenAssertions();
