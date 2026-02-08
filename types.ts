export enum Status {
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
  countryCode: string;
  avatarUrl?: string;
}

export type ScopeType = 'Global' | 'Regional' | 'Local';
export type TargetSystem = 'Ordering Portal' | 'Admin Portal';

export interface Task {
  id: string;
  title: string;
  description: string;
  featureModule: string; 
  status: Status;
  priority: Priority;
  countryCode: string;
  assigneeId: string;
  dueDate: string;
  steps: TestStep[];
  updatedAt: string;
  
  // New Integration & Meta Fields
  jiraTicket?: string;
  crNumber?: string; // Change Request Number (SAP)
  developer?: string;
  scope: ScopeType;
  targetSystem: TargetSystem; // Determines the UAT URL
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
  };
  country?: {
    code: string;
    name: string;
  };
}

export interface TestStep {
  id: string;
  description: string;
  // pageContext removed as requested
  expectedResult: string;
  testData?: string;
  actualResult?: string;
  isPassed?: boolean | null;
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

export type ViewState = 'LOGIN' | 'DASHBOARD_STAKEHOLDER' | 'DASHBOARD_ADMIN' | 'TASK_DETAIL' | 'IMPORT_WIZARD' | 'ADMIN_TASK_MANAGEMENT' | 'ADMIN_DATABASE';
