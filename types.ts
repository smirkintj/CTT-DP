export enum Status {
  DRAFT = 'Draft',
  READY = 'Ready',
  PENDING = 'Pending',
  IN_PROGRESS = 'In Progress',
  PASSED = 'Passed',
  FAILED = 'Failed',
  BLOCKED = 'Blocked',
  DEPLOYED = 'Deployed',
}

export enum Priority {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  CRITICAL = 'Critical',
}

export enum Role {
  ADMIN = 'Admin',
  STAKEHOLDER = 'Stakeholder',
  QA = 'QA',
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  countryCode: string | null;
  avatarUrl?: string;
  productAccesses?: ProductSummary[];
}

export type ScopeType = 'Global' | 'Regional' | 'Local';

export interface ProductSummary {
  id: string;
  name: string;
  slug: string;
}

export interface TargetSystemSummary {
  id: string;
  name: string;
  baseUrl?: string | null;
}

export interface Task {
  id: string;
  taskGroupId?: string | null;
  title: string;
  description: string;
  productId: string;
  productName: string;
  productSlug?: string;
  featureModule: string; 
  status: Status;
  priority: Priority;
  countryCode: string;
  assigneeId: string | null;
  dueDate: string | null;
  createdAt?: string;
  steps: TestStep[];
  comments?: Comment[];
  commentCount?: number;
  updatedAt: string;
  updatedBy?: {
    id: string;
    name: string;
    email: string;
  };
  signedOffAt?: string | null;
  signedOffBy?: {
    id: string;
    name: string;
    email: string;
  };
  
  // New Integration & Meta Fields
  jiraTicket?: string;
  jiraTicketVerified?: boolean;
  eodTicket?: string | null;
  sitSignedOffAt?: string | null;
  sitComment?: string | null;
  crNumber?: string; // Change Request Number (SAP)
  developer?: string;
  scope: ScopeType;
  targetSystem?: string;
  targetSystemId?: string | null;
  targetSystemUrl?: string | null;
  referenceVideoUrl?: string; // URL for GIF/Video guide
  
  // Blocking
  blockReason?: string; // Specific reason why testing is held
  
  // Sign-off (Locking mechanism)
  signedOff?: {
    signedBy: string;
    signedAt: string;
    signatureData?: string; // Base64 image
  };

  // Deployment Fields (Admin only)
  deployment?: {
    isDeployed: boolean;
    deployedAt?: string;
    releaseVersion?: string;
    deployedBy?: string;
  };

  assignee?: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
    countryCode?: string;
  };
  country?: {
    code: string;
    name: string;
  };
}

export interface TestStep {
  id: string;
  order?: number;
  description: string;
  // pageContext removed as requested
  expectedResult: string;
  testData?: string;
  actualResult?: string;
  isPassed?: boolean | null;
  stepResult?: 'PASSED' | 'FAILED' | 'CONDITIONAL' | null;
  conditionalReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  attachments?: string[]; // Array of base64 image strings
  comments: Comment[]; 
  
  // Creation Logic Only (Not strictly persisted in final task if filtered out)
  countryFilter?: string | 'ALL'; 
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  stepOrder?: number | null;
  author: {
    id: string;
    name: string;
    email: string;
  };
}

export interface Notification {
  id: string;
  userId: string;
  type: 'ALERT' | 'INFO' | 'SUCCESS' | 'MENTION';
  message: string;
  time: string;
  isRead: boolean;
  relatedTaskId?: string;
}

export interface CountryConfig {
  code: string;
  name: string;
  color: string;
  flag?: string; 
}

export interface AdminProductConfig extends ProductSummary {
  isActive: boolean;
  jiraProjectKey?: string | null;
  jiraPullStatuses?: string[];
  jiraInUatTransition?: string | null;
  jiraReadyToDeployTransition?: string | null;
  jiraBaseUrl?: string | null;
  jiraEmail?: string | null;
  jiraTokenSet?: boolean; // true if a token is stored (never expose the actual value)
  modules: Array<{ id: string; name: string; isActive: boolean }>;
  targetSystems: Array<TargetSystemSummary & { isActive: boolean }>;
}

export interface JiraLinkedTaskSummary {
  id: string;
  title: string;
  status: Status;
  countryCode: string;
  productName: string;
  sitSignedOffAt?: string | null;
}

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  updatedAt: string;
  priority?: string | null;
  assigneeName?: string | null;
  productId: string;
  productName: string;
  projectKey: string;
  jiraBaseUrl?: string;
  linkedTasks: JiraLinkedTaskSummary[];
  sitComplete: boolean;
  sitComment: string | null;
  sitCommentId: string | null;
  sitAuthor: string | null;
  sitDate: string | null;
}

export interface JiraIssueGroup {
  productId: string;
  productName: string;
  productSlug: string;
  projectKey: string;
  statuses: string[];
  issues: JiraIssue[];
  error?: string;
}

export interface JiraTaskPrefill {
  jiraTicket: string;
  title: string;
  description: string;
  productId: string;
  productName: string;
}

export type ViewState = 'LOGIN' | 'DASHBOARD_STAKEHOLDER' | 'DASHBOARD_ADMIN' | 'TASK_DETAIL' | 'IMPORT_WIZARD' | 'ADMIN_TASK_MANAGEMENT' | 'ADMIN_DATABASE' | 'ADMIN_JIRA_INTAKE' | 'INBOX' | 'KNOWLEDGE_BASE' | 'QA_DASHBOARD' | 'QA_JIRA_QUEUE' | 'QA_SIT_TASK_DETAIL';

export type SitTaskStatus = 'DRAFT' | 'READY' | 'IN_PROGRESS' | 'SIGNED_OFF';
export type SitCaseStatus = 'NOT_STARTED' | 'PASS' | 'CONDITIONAL' | 'FAIL' | 'BLOCKED';
export type SitEvidenceType = 'IMAGE' | 'JAM_LINK';
export type SitHistoryAction =
  | 'TASK_CREATED' | 'TASK_PUBLISHED' | 'STATUS_CHANGED'
  | 'TEST_CASE_ADDED' | 'TEST_CASE_MODIFIED' | 'TEST_CASE_REMOVED'
  | 'TEST_CASE_RESULT_RECORDED' | 'CONDITIONAL_ACKNOWLEDGED'
  | 'DEFECT_LINKED' | 'DEFECT_UNLINKED' | 'EVIDENCE_ADDED'
  | 'SCOPE_NOTE_ADDED' | 'SIGNED_OFF';

export interface SitCountryResult {
  countryCode: string;
  status: SitCaseStatus;
  actualResult: string | null;
  testerName: string | null;
  testedAt: string | null;
}

export interface SitEvidence {
  id: string;
  type: SitEvidenceType;
  url: string | null;
  filename: string | null;
  createdAt: string;
}

export interface SitDefect {
  id: string;
  jiraKey: string;
  summary: string | null;
  status: string | null;
  priority: string | null;
  url: string | null;
}

export interface SitTestCase {
  id: string;
  seqId: number;
  priority: string | null;
  category: string | null;
  name: string;
  description: string | null;
  steps: string | null;
  expectedResult: string | null;
  testData: string | null;
  actualResult: string | null;
  status: SitCaseStatus;
  testerName: string | null;
  testedAt: string | null;
  conditionalNote: string | null;
  adminAcknowledgedAt: string | null;
  splitByCountry: boolean;
  evidence: SitEvidence[];
  defects: SitDefect[];
  countryResults: SitCountryResult[];
}

export interface SitTaskSummary {
  id: string;
  sprintName: string;
  jiraTicket: string;
  title: string;
  productId: string;
  productName: string;
  module: string | null;
  environment: string | null;
  status: SitTaskStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  signedOffAt: string | null;
  countryCodes: string[];
  testCaseCount: number;
  passCount: number;
  failCount: number;
  conditionalCount: number;
  blockedCount: number;
  notStartedCount: number;
  hasUnacknowledgedConditionals: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SitTaskDetail extends SitTaskSummary {
  testCases: SitTestCase[];
  history: SitHistoryEntry[];
}

export interface SitHistoryEntry {
  id: string;
  action: SitHistoryAction;
  message: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actorName: string;
  createdAt: string;
}
