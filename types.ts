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
  userId: string;
  text: string;
  createdAt: string;
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
  modules: Array<{ id: string; name: string; isActive: boolean }>;
  targetSystems: Array<TargetSystemSummary & { isActive: boolean }>;
}

export interface JiraLinkedTaskSummary {
  id: string;
  title: string;
  status: Status;
  countryCode: string;
  productName: string;
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
  linkedTasks: JiraLinkedTaskSummary[];
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

export type ViewState = 'LOGIN' | 'DASHBOARD_STAKEHOLDER' | 'DASHBOARD_ADMIN' | 'TASK_DETAIL' | 'IMPORT_WIZARD' | 'ADMIN_TASK_MANAGEMENT' | 'ADMIN_DATABASE' | 'ADMIN_JIRA_INTAKE' | 'INBOX' | 'KNOWLEDGE_BASE';
