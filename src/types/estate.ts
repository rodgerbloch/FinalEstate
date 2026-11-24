export type TaskCategory =
  | 'Assets'
  | 'Liabilities'
  | 'Cashflow'
  | 'Legal & Probate'
  | 'Insurance'
  | 'Digital & Access'
  | 'Final Wishes';

export const TASK_CATEGORIES: TaskCategory[] = [
  'Assets',
  'Liabilities',
  'Cashflow',
  'Legal & Probate',
  'Insurance',
  'Digital & Access',
  'Final Wishes',
];

export type DocumentCategory = TaskCategory | 'General';

export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  'Assets',
  'Liabilities',
  'Cashflow',
  'Legal & Probate',
  'Insurance',
  'Digital & Access',
  'Final Wishes',
  'General',
];

export type EstateStage = 'Pre-Need Planning' | 'Executor Action';
export type TaskPriority = 'High' | 'Medium' | 'Low';
export type TaskStatusBucket = 'past_due' | 'upcoming' | 'outstanding' | 'completed';
export type TaskStatusFilter = 'all' | TaskStatusBucket;
export type StageFilter = 'all' | EstateStage;
export type ViewMode = 'buckets' | 'status' | 'timeline';
export type NavSection = 'tasks' | 'summary' | 'vault' | 'sharing' | 'consultant';

export type ExecutiveSummaryPeriodDays = 7 | 30 | 90;

export interface ExecutiveSummaryFocusItem {
  taskTitle: string;
  category: string;
  urgencyReason: string;
  recommendedNextStep: string;
}

export interface ExecutiveSummaryReport {
  healthRating: 'On Track' | 'Needs Attention' | 'Critical Priorities';
  headline: string;
  estateHealthOverview: string;
  highPriorityFocus: ExecutiveSummaryFocusItem[];
  documentVaultAssessment: string;
  periodicActionPlan: string[];
  disclaimer: string;
}

export type CollaboratorRole =
  | 'Family Member'
  | 'Legal Advisor'
  | 'Co-Executor'
  | 'Financial Advisor';

export const COLLABORATOR_ROLES: CollaboratorRole[] = [
  'Family Member',
  'Co-Executor',
  'Legal Advisor',
  'Financial Advisor',
];

export type CollaboratorPermission = 'View & Update' | 'View Only';

export interface Estate {
  id: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  title: string;
  principalName: string;
  activeStage: EstateStage;
  notes: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface EstateMember {
  uid: string;
  estateId: string;
  estateTitle: string;
  ownerId: string;
  ownerName: string;
  email: string;
  displayName: string;
  role: CollaboratorRole;
  permission: CollaboratorPermission;
  invitationId: string;
  taskIds: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface EstateTask {
  id: string;
  estateId: string;
  ownerId: string;
  title: string;
  category: TaskCategory;
  stage: EstateStage;
  priority: TaskPriority;
  timingLabel: string;
  dueDate: string;
  reminderAt: string;
  reminderDismissed: boolean;
  instructions: string[];
  executorNotes: string;
  completed: boolean;
  completedAt: string;
  prerequisiteTaskIds: string[];
  sharedWithEmails: string[];
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type TaskCommentKind = 'note' | 'question' | 'update';

export interface TaskComment {
  id: string;
  estateId: string;
  taskId: string;
  ownerId: string;
  authorUid: string;
  authorName: string;
  authorRole: string;
  kind: TaskCommentKind;
  body: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface VaultDocument {
  id: string;
  estateId: string;
  ownerId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  category: DocumentCategory;
  taskId: string;
  notes: string;
  chunkCount: number;
  uploadedByUid: string;
  uploadedByName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Invitation {
  id: string;
  estateId: string;
  estateTitle: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  inviteeEmail: string;
  inviteeUid: string;
  role: CollaboratorRole;
  permission: CollaboratorPermission;
  taskIds: string[];
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  createdAt?: unknown;
  updatedAt?: unknown;
}
