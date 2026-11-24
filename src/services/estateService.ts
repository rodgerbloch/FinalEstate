import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { STARTER_PLAYBOOK, buildSeedTaskDueDate } from '../data/starterPlaybook';
import { OperationType, auth, db, handleFirestoreError } from '../firebase';
import type {
  CollaboratorPermission,
  CollaboratorRole,
  DocumentCategory,
  Estate,
  EstateMember,
  EstateStage,
  EstateTask,
  Invitation,
  TaskCategory,
  TaskComment,
  TaskCommentKind,
  TaskPriority,
  VaultDocument,
} from '../types/estate';
import {
  arrayBufferToBase64Chunks,
  base64ChunksToBlob,
  clampString,
  computeSha256Hex,
  generateValidId,
} from '../utils/taskHelpers';
import type { CsvImportTaskInput } from '../utils/csvTasks';

export async function ensureUserAndStarterEstate(user: User): Promise<string> {
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  const cleanEmail = clampString(user.email || '', 200).toLowerCase();
  const cleanDisplayName =
    clampString(user.displayName || user.email || '', 120) || 'Account Holder';
  const cleanPhotoURL = clampString(user.photoURL || '', 500);

  try {
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        email: cleanEmail,
        displayName: cleanDisplayName,
        photoURL: cleanPhotoURL,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        email: cleanEmail,
        displayName: cleanDisplayName,
        photoURL: cleanPhotoURL,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  const estatesPath = 'estates';
  let existingSnapshot;
  try {
    const q = query(collection(db, estatesPath), where('ownerId', '==', user.uid));
    existingSnapshot = await getDocs(q);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, estatesPath);
  }

  if (existingSnapshot && !existingSnapshot.empty) {
    return existingSnapshot.docs[0].id;
  }

  const estateId = generateValidId('est');
  const displayName =
    clampString(user.displayName || user.email?.split('@')[0] || '', 100) || 'Family';
  const estateTitle = clampString(`${displayName} Estate Ledger`, 140) || 'Estate Ledger';
  const ownerName =
    clampString(user.displayName || user.email || '', 120) || 'Estate Owner';

  // Commit parent estate document first so subcollection task rules calling
  // exists()/get() on estates/{estateId} can verify ownership cleanly.
  const estateRef = doc(db, 'estates', estateId);
  try {
    await setDoc(estateRef, {
      id: estateId,
      ownerId: user.uid,
      ownerEmail: cleanEmail,
      ownerName,
      title: estateTitle,
      principalName: displayName,
      activeStage: 'Pre-Need Planning' as EstateStage,
      notes: 'Prepared for family clarity and seamless executor handoff.',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `estates/${estateId}`);
  }

  const batch = writeBatch(db);
  const seededIds = STARTER_PLAYBOOK.map(() => generateValidId('tsk'));
  const titleToId = new Map<string, string>();
  STARTER_PLAYBOOK.forEach((seed, idx) => {
    titleToId.set(seed.title, seededIds[idx]);
  });

  STARTER_PLAYBOOK.forEach((seed, idx) => {
    const taskId = seededIds[idx];
    const taskRef = doc(db, 'estates', estateId, 'tasks', taskId);
    const completed = Boolean(seed.completed);
    const prerequisiteTaskIds = (seed.prerequisiteTitles || [])
      .map((t) => titleToId.get(t))
      .filter((id): id is string => Boolean(id && id !== taskId))
      .slice(0, 20);
    batch.set(taskRef, {
      id: taskId,
      estateId,
      ownerId: user.uid,
      title: clampString(seed.title, 200) || 'Estate Task',
      category: seed.category,
      stage: seed.stage,
      priority: seed.priority,
      timingLabel: clampString(seed.timingLabel, 80),
      dueDate: buildSeedTaskDueDate(seed.offsetDays),
      reminderAt: '',
      reminderDismissed: false,
      instructions: seed.instructions.slice(0, 30).map((s) => clampString(s, 600)).filter(Boolean),
      executorNotes: clampString(seed.executorNotes, 10000),
      completed,
      completedAt: completed ? new Date().toISOString() : '',
      prerequisiteTaskIds,
      sharedWithEmails: [],
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `estates/${estateId}/tasks`);
  }

  return estateId;
}

export async function updateEstateProfile(
  estateId: string,
  updates: Partial<Pick<Estate, 'title' | 'principalName' | 'activeStage' | 'notes'>>
): Promise<void> {
  const path = `estates/${estateId}`;
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (typeof updates.title === 'string') payload.title = clampString(updates.title, 140) || 'Estate Ledger';
  if (typeof updates.principalName === 'string') payload.principalName = clampString(updates.principalName, 120) || 'Estate Principal';
  if (updates.activeStage) payload.activeStage = updates.activeStage;
  if (typeof updates.notes === 'string') payload.notes = clampString(updates.notes, 5000);

  try {
    await updateDoc(doc(db, 'estates', estateId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export interface CreateTaskInput {
  title: string;
  category: TaskCategory;
  stage: EstateStage;
  priority: TaskPriority;
  timingLabel: string;
  dueDate: string;
  reminderAt: string;
  instructions: string[];
  executorNotes: string;
  prerequisiteTaskIds?: string[];
}

function sanitizePrerequisiteIds(ids: string[] | undefined, selfId?: string): string[] {
  if (!Array.isArray(ids)) return [];
  const clean: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = clampString(raw, 128);
    if (!id || id === selfId || !/^[a-zA-Z0-9_-]+$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    clean.push(id);
    if (clean.length >= 20) break;
  }
  return clean;
}

export async function createEstateTask(
  estateId: string,
  ownerId: string,
  createdBy: string,
  input: CreateTaskInput
): Promise<string> {
  const taskId = generateValidId('tsk');
  const path = `estates/${estateId}/tasks/${taskId}`;
  try {
    await setDoc(doc(db, 'estates', estateId, 'tasks', taskId), {
      id: taskId,
      estateId,
      ownerId,
      title: clampString(input.title, 200) || 'Untitled Task',
      category: input.category,
      stage: input.stage,
      priority: input.priority,
      timingLabel: clampString(input.timingLabel, 80),
      dueDate: clampString(input.dueDate, 32),
      reminderAt: clampString(input.reminderAt, 40),
      reminderDismissed: false,
      instructions: input.instructions
        .map((s) => clampString(s, 600))
        .filter(Boolean)
        .slice(0, 30),
      executorNotes: clampString(input.executorNotes, 10000),
      completed: false,
      completedAt: '',
      prerequisiteTaskIds: sanitizePrerequisiteIds(input.prerequisiteTaskIds, taskId),
      sharedWithEmails: [],
      createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return taskId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function bulkCreateEstateTasks(
  estateId: string,
  ownerId: string,
  createdBy: string,
  items: CsvImportTaskInput[]
): Promise<number> {
  if (items.length === 0) return 0;
  const CHUNK_SIZE = 350;
  const nowIso = new Date().toISOString();
  let createdCount = 0;

  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const slice = items.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const item of slice) {
      const taskId = generateValidId('tsk');
      batch.set(doc(db, 'estates', estateId, 'tasks', taskId), {
        id: taskId,
        estateId,
        ownerId,
        title: clampString(item.title, 200) || 'Untitled Task',
        category: item.category,
        stage: item.stage,
        priority: item.priority,
        timingLabel: clampString(item.timingLabel, 80),
        dueDate: clampString(item.dueDate, 32),
        reminderAt: '',
        reminderDismissed: false,
        instructions: item.instructions
          .map((s) => clampString(s, 600))
          .filter(Boolean)
          .slice(0, 30),
        executorNotes: clampString(item.executorNotes, 10000),
        completed: Boolean(item.completed),
        completedAt: item.completed ? nowIso : '',
        prerequisiteTaskIds: [],
        sharedWithEmails: [],
        createdBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    try {
      await batch.commit();
      createdCount += slice.length;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `estates/${estateId}/tasks`);
    }
  }
  return createdCount;
}

export async function updateEstateTask(
  estateId: string,
  taskId: string,
  updates: Partial<
    Pick<
      EstateTask,
      | 'title'
      | 'category'
      | 'stage'
      | 'priority'
      | 'timingLabel'
      | 'dueDate'
      | 'reminderAt'
      | 'reminderDismissed'
      | 'instructions'
      | 'executorNotes'
      | 'completed'
      | 'completedAt'
      | 'prerequisiteTaskIds'
      | 'sharedWithEmails'
    >
  >
): Promise<void> {
  const path = `estates/${estateId}/tasks/${taskId}`;
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };

  if (typeof updates.title === 'string') payload.title = clampString(updates.title, 200);
  if (updates.category) payload.category = updates.category;
  if (updates.stage) payload.stage = updates.stage;
  if (updates.priority) payload.priority = updates.priority;
  if (typeof updates.timingLabel === 'string') payload.timingLabel = clampString(updates.timingLabel, 80);
  if (typeof updates.dueDate === 'string') payload.dueDate = clampString(updates.dueDate, 32);
  if (typeof updates.reminderAt === 'string') payload.reminderAt = clampString(updates.reminderAt, 40);
  if (typeof updates.reminderDismissed === 'boolean') payload.reminderDismissed = updates.reminderDismissed;
  if (Array.isArray(updates.instructions)) {
    payload.instructions = updates.instructions
      .map((s) => clampString(s, 600))
      .filter(Boolean)
      .slice(0, 30);
  }
  if (typeof updates.executorNotes === 'string') payload.executorNotes = clampString(updates.executorNotes, 10000);
  if (typeof updates.completed === 'boolean') payload.completed = updates.completed;
  if (typeof updates.completedAt === 'string') payload.completedAt = clampString(updates.completedAt, 40);
  if (Array.isArray(updates.prerequisiteTaskIds)) {
    payload.prerequisiteTaskIds = sanitizePrerequisiteIds(updates.prerequisiteTaskIds, taskId);
  }
  if (Array.isArray(updates.sharedWithEmails)) {
    payload.sharedWithEmails = updates.sharedWithEmails
      .map((e) => clampString(e, 200).toLowerCase())
      .filter(Boolean)
      .slice(0, 25);
  }

  try {
    await updateDoc(doc(db, 'estates', estateId, 'tasks', taskId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteEstateTask(
  estateId: string,
  taskId: string,
  dependentTasks: EstateTask[] = [],
  ownerId?: string
): Promise<void> {
  const path = `estates/${estateId}/tasks/${taskId}`;
  try {
    const currentUid = auth.currentUser?.uid;
    const commentsCol = collection(db, 'estates', estateId, 'tasks', taskId, 'comments');
    const commentsQuery =
      currentUid && (!ownerId || ownerId === currentUid)
        ? query(
            commentsCol,
            where('estateId', '==', estateId),
            where('taskId', '==', taskId),
            where('ownerId', '==', currentUid)
          )
        : query(
            commentsCol,
            where('estateId', '==', estateId),
            where('taskId', '==', taskId)
          );
    const commentsSnap = await getDocs(commentsQuery);
    if (dependentTasks.length === 0 && commentsSnap.empty) {
      await deleteDoc(doc(db, 'estates', estateId, 'tasks', taskId));
      return;
    }
    const batch = writeBatch(db);
    commentsSnap.docs.forEach((commentDoc) => {
      batch.delete(commentDoc.ref);
    });
    batch.delete(doc(db, 'estates', estateId, 'tasks', taskId));
    for (const dep of dependentTasks) {
      const nextIds = (dep.prerequisiteTaskIds || []).filter((id) => id !== taskId);
      batch.update(doc(db, 'estates', estateId, 'tasks', dep.id), {
        prerequisiteTaskIds: nextIds,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createTaskComment(
  estateId: string,
  ownerId: string,
  taskId: string,
  user: User,
  authorRole: string,
  kind: TaskCommentKind,
  body: string
): Promise<string> {
  const commentId = generateValidId('cmt');
  const path = `estates/${estateId}/tasks/${taskId}/comments/${commentId}`;
  const cleanBody = clampString(body, 2000);
  if (!cleanBody) {
    throw new Error('Please enter a message before posting.');
  }
  try {
    await setDoc(doc(db, 'estates', estateId, 'tasks', taskId, 'comments', commentId), {
      id: commentId,
      estateId,
      taskId,
      ownerId,
      authorUid: user.uid,
      authorName: clampString(user.displayName || user.email || 'Collaborator', 120) || 'Collaborator',
      authorRole: clampString(authorRole, 60) || 'Collaborator',
      kind,
      body: cleanBody,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return commentId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateTaskComment(
  estateId: string,
  taskId: string,
  commentId: string,
  kind: TaskCommentKind,
  body: string
): Promise<void> {
  const path = `estates/${estateId}/tasks/${taskId}/comments/${commentId}`;
  const cleanBody = clampString(body, 2000);
  if (!cleanBody) {
    throw new Error('Comment body cannot be empty.');
  }
  try {
    await updateDoc(doc(db, 'estates', estateId, 'tasks', taskId, 'comments', commentId), {
      kind,
      body: cleanBody,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTaskComment(
  estateId: string,
  taskId: string,
  commentId: string
): Promise<void> {
  const path = `estates/${estateId}/tasks/${taskId}/comments/${commentId}`;
  try {
    await deleteDoc(doc(db, 'estates', estateId, 'tasks', taskId, 'comments', commentId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function uploadVaultDocument(
  estateId: string,
  ownerId: string,
  user: User,
  file: File,
  category: DocumentCategory,
  taskId: string,
  notes: string
): Promise<string> {
  const maxBytes = 8 * 1024 * 1024; // 8 MB ceiling -> max ~24 chunks
  if (file.size > maxBytes) {
    throw new Error('File exceeds the 8 MB vault upload limit. Please compress or split the document.');
  }

  const buffer = await file.arrayBuffer();
  const sha256 = await computeSha256Hex(buffer);
  const chunks = arrayBufferToBase64Chunks(buffer);
  if (chunks.length > 30) {
    throw new Error('Encoded file exceeds chunk limit. Please upload a smaller file.');
  }

  const docId = generateValidId('doc');
  const docPath = `estates/${estateId}/documents/${docId}`;
  const batch = writeBatch(db);

  batch.set(doc(db, 'estates', estateId, 'documents', docId), {
    id: docId,
    estateId,
    ownerId,
    name: clampString(file.name, 220) || 'Untitled Document',
    mimeType: clampString(file.type || 'application/octet-stream', 120),
    sizeBytes: file.size,
    sha256,
    category,
    taskId: clampString(taskId, 128),
    notes: clampString(notes, 4000),
    chunkCount: chunks.length,
    uploadedByUid: user.uid,
    uploadedByName: clampString(user.displayName || user.email || 'Collaborator', 120),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  chunks.forEach((chunkData, index) => {
    const chunkId = `chk_${String(index).padStart(4, '0')}`;
    batch.set(doc(db, 'estates', estateId, 'documents', docId, 'chunks', chunkId), {
      index,
      estateId,
      ownerId,
      data: chunkData,
    });
  });

  try {
    await batch.commit();
    return docId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

export async function fetchVaultDocumentBlob(estateId: string, documentItem: VaultDocument): Promise<Blob> {
  const chunksPath = `estates/${estateId}/documents/${documentItem.id}/chunks`;
  try {
    const currentUid = auth.currentUser?.uid;
    const chunksCol = collection(db, 'estates', estateId, 'documents', documentItem.id, 'chunks');
    const chunksQuery =
      currentUid && documentItem.ownerId === currentUid
        ? query(chunksCol, where('estateId', '==', estateId), where('ownerId', '==', currentUid))
        : query(chunksCol, where('estateId', '==', estateId));
    const snap = await getDocs(chunksQuery);
    const sorted = snap.docs
      .map((d) => d.data() as { index: number; data: string })
      .sort((a, b) => a.index - b.index);
    return base64ChunksToBlob(
      sorted.map((s) => s.data),
      documentItem.mimeType
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, chunksPath);
  }
}

export async function updateVaultDocumentMetadata(
  estateId: string,
  docId: string,
  updates: Partial<Pick<VaultDocument, 'name' | 'category' | 'taskId' | 'notes'>>
): Promise<void> {
  const path = `estates/${estateId}/documents/${docId}`;
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (typeof updates.name === 'string') payload.name = clampString(updates.name, 220) || 'Document';
  if (updates.category) payload.category = updates.category;
  if (typeof updates.taskId === 'string') payload.taskId = clampString(updates.taskId, 128);
  if (typeof updates.notes === 'string') payload.notes = clampString(updates.notes, 4000);

  try {
    await updateDoc(doc(db, 'estates', estateId, 'documents', docId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteVaultDocument(
  estateId: string,
  docId: string,
  ownerId?: string
): Promise<void> {
  const path = `estates/${estateId}/documents/${docId}`;
  try {
    const currentUid = auth.currentUser?.uid;
    const chunksCol = collection(db, 'estates', estateId, 'documents', docId, 'chunks');
    const chunksQuery =
      currentUid && ownerId === currentUid
        ? query(chunksCol, where('estateId', '==', estateId), where('ownerId', '==', currentUid))
        : query(chunksCol, where('estateId', '==', estateId));
    const chunksSnap = await getDocs(chunksQuery);
    const batch = writeBatch(db);
    chunksSnap.docs.forEach((chunkDoc) => {
      batch.delete(chunkDoc.ref);
    });
    batch.delete(doc(db, 'estates', estateId, 'documents', docId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function sendCollaboratorInvitation(
  estate: Estate,
  inviteeEmailRaw: string,
  role: CollaboratorRole,
  permission: CollaboratorPermission,
  taskIds: string[],
  tasks: EstateTask[]
): Promise<string> {
  const inviteeEmail = clampString(inviteeEmailRaw, 200).toLowerCase();
  if (!inviteeEmail || !inviteeEmail.includes('@')) {
    throw new Error('Please enter a valid collaborator email address.');
  }
  if (inviteeEmail === estate.ownerEmail.toLowerCase()) {
    throw new Error('You are already the owner of this estate.');
  }

  const inviteId = generateValidId('inv');
  const path = `invitations/${inviteId}`;
  const batch = writeBatch(db);

  batch.set(doc(db, 'invitations', inviteId), {
    id: inviteId,
    estateId: estate.id,
    estateTitle: clampString(estate.title, 140),
    ownerId: estate.ownerId,
    ownerEmail: clampString(estate.ownerEmail, 200).toLowerCase(),
    ownerName: clampString(estate.ownerName, 120),
    inviteeEmail,
    inviteeUid: '',
    role,
    permission,
    taskIds: taskIds.slice(0, 50),
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Also reflect collaborator email on any specifically shared tasks
  if (taskIds.length > 0) {
    for (const tid of taskIds.slice(0, 20)) {
      const targetTask = tasks.find((t) => t.id === tid);
      if (targetTask) {
        const mergedEmails = Array.from(new Set([...targetTask.sharedWithEmails, inviteeEmail])).slice(0, 25);
        batch.update(doc(db, 'estates', estate.id, 'tasks', tid), {
          sharedWithEmails: mergedEmails,
          updatedAt: serverTimestamp(),
        });
      }
    }
  }

  try {
    await batch.commit();
    return inviteId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function acceptCollaboratorInvitation(invitation: Invitation, user: User): Promise<void> {
  const batch = writeBatch(db);
  const invRef = doc(db, 'invitations', invitation.id);
  const memberRef = doc(db, 'estates', invitation.estateId, 'members', user.uid);

  batch.update(invRef, {
    status: 'accepted',
    inviteeUid: user.uid,
    updatedAt: serverTimestamp(),
  });

  batch.set(memberRef, {
    uid: user.uid,
    estateId: invitation.estateId,
    estateTitle: clampString(invitation.estateTitle, 140),
    ownerId: invitation.ownerId,
    ownerName: clampString(invitation.ownerName, 120),
    email: clampString(user.email || invitation.inviteeEmail, 200).toLowerCase(),
    displayName: clampString(user.displayName || user.email || 'Collaborator', 120),
    role: invitation.role,
    permission: invitation.permission,
    invitationId: invitation.id,
    taskIds: invitation.taskIds.slice(0, 50),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `invitations/${invitation.id}`);
  }
}

export async function declineCollaboratorInvitation(invitation: Invitation, user: User): Promise<void> {
  const path = `invitations/${invitation.id}`;
  try {
    await updateDoc(doc(db, 'invitations', invitation.id), {
      status: 'declined',
      inviteeUid: user.uid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateInvitationPermissions(
  invitation: Invitation,
  role: CollaboratorRole,
  permission: CollaboratorPermission
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'invitations', invitation.id), {
    role,
    permission,
    updatedAt: serverTimestamp(),
  });

  if (invitation.status === 'accepted' && invitation.inviteeUid) {
    batch.update(doc(db, 'estates', invitation.estateId, 'members', invitation.inviteeUid), {
      role,
      permission,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `invitations/${invitation.id}`);
  }
}

export async function revokeCollaboratorInvitation(invitation: Invitation): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'invitations', invitation.id), {
    status: 'revoked',
    updatedAt: serverTimestamp(),
  });

  if (invitation.inviteeUid) {
    batch.delete(doc(db, 'estates', invitation.estateId, 'members', invitation.inviteeUid));
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `invitations/${invitation.id}`);
  }
}

export function subscribeOwnedEstates(
  userId: string,
  onData: (estates: Estate[]) => void
): () => void {
  const path = 'estates';
  const q = query(collection(db, path), where('ownerId', '==', userId));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as Estate));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeOutgoingInvitations(
  userId: string,
  onData: (invitations: Invitation[]) => void
): () => void {
  const path = 'invitations';
  const q = query(collection(db, path), where('ownerId', '==', userId));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as Invitation));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeIncomingInvitations(
  emailLower: string,
  onData: (invitations: Invitation[]) => void
): () => void {
  const path = 'invitations';
  const q = query(collection(db, path), where('inviteeEmail', '==', emailLower));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as Invitation));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeEstateDoc(
  estateId: string,
  onData: (estate: Estate | null) => void
): () => void {
  const path = `estates/${estateId}`;
  return onSnapshot(
    doc(db, 'estates', estateId),
    (snap) => {
      onData(snap.exists() ? (snap.data() as Estate) : null);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function subscribeEstateMemberDoc(
  estateId: string,
  uid: string,
  onData: (member: EstateMember | null) => void
): () => void {
  const path = `estates/${estateId}/members/${uid}`;
  return onSnapshot(
    doc(db, 'estates', estateId, 'members', uid),
    (snap) => {
      onData(snap.exists() ? (snap.data() as EstateMember) : null);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function subscribeEstateMembers(
  estateId: string,
  ownerUid: string,
  onData: (members: EstateMember[]) => void
): () => void {
  const path = `estates/${estateId}/members`;
  const q = query(collection(db, 'estates', estateId, 'members'), where('ownerId', '==', ownerUid));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as EstateMember));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

function normalizeEstateTask(raw: EstateTask): EstateTask {
  return {
    ...raw,
    prerequisiteTaskIds: Array.isArray(raw.prerequisiteTaskIds) ? raw.prerequisiteTaskIds : [],
    sharedWithEmails: Array.isArray(raw.sharedWithEmails) ? raw.sharedWithEmails : [],
    instructions: Array.isArray(raw.instructions) ? raw.instructions : [],
  };
}

export function subscribeEstateTasks(
  estateId: string,
  ownerUidIfOwner: string | null,
  restrictedTaskIds: string[] | null,
  onData: (tasks: EstateTask[]) => void
): () => void {
  const path = `estates/${estateId}/tasks`;
  if (restrictedTaskIds && restrictedTaskIds.length > 0) {
    // Per-task scoped collaborator: subscribe individually to each authorized task doc
    const map = new Map<string, EstateTask>();
    const unsubs = restrictedTaskIds.map((taskId) =>
      onSnapshot(
        doc(db, 'estates', estateId, 'tasks', taskId),
        (snap) => {
          if (snap.exists()) {
            map.set(taskId, normalizeEstateTask(snap.data() as EstateTask));
          } else {
            map.delete(taskId);
          }
          onData(Array.from(map.values()));
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, `${path}/${taskId}`);
        }
      )
    );
    return () => {
      unsubs.forEach((u) => u());
    };
  }

  const tasksCol = collection(db, 'estates', estateId, 'tasks');
  const q = ownerUidIfOwner
    ? query(tasksCol, where('estateId', '==', estateId), where('ownerId', '==', ownerUidIfOwner))
    : query(tasksCol, where('estateId', '==', estateId));

  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => normalizeEstateTask(d.data() as EstateTask)));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeEstateDocuments(
  estateId: string,
  ownerUidIfOwner: string | null,
  onData: (docs: VaultDocument[]) => void
): () => void {
  const path = `estates/${estateId}/documents`;
  const docsCol = collection(db, 'estates', estateId, 'documents');
  const q = ownerUidIfOwner
    ? query(docsCol, where('estateId', '==', estateId), where('ownerId', '==', ownerUidIfOwner))
    : query(docsCol, where('estateId', '==', estateId));

  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as VaultDocument));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

function timestampMillis(value: unknown): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in value &&
    typeof (value as { toMillis: unknown }).toMillis === 'function'
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
  }
  return Number.MAX_SAFE_INTEGER;
}

export function subscribeTaskComments(
  estateId: string,
  taskId: string,
  ownerUidIfOwner: string | null,
  onData: (comments: TaskComment[]) => void
): () => void {
  const path = `estates/${estateId}/tasks/${taskId}/comments`;
  const commentsCol = collection(db, 'estates', estateId, 'tasks', taskId, 'comments');
  const q = ownerUidIfOwner
    ? query(
        commentsCol,
        where('estateId', '==', estateId),
        where('taskId', '==', taskId),
        where('ownerId', '==', ownerUidIfOwner)
      )
    : query(commentsCol, where('estateId', '==', estateId), where('taskId', '==', taskId));

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as TaskComment);
      list.sort((a, b) => timestampMillis(a.createdAt) - timestampMillis(b.createdAt));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}
