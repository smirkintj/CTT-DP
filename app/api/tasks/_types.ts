export interface TaskStepDTO {
  id: string;
  order: number;
  description: string;
  expectedResult: string;
  testData?: string | null;
  actualResult?: string | null;
  isPassed?: boolean | null;
  stepResult?: 'PASSED' | 'FAILED' | 'CONDITIONAL' | null;
  conditionalReason?: string | null;
  attachments?: unknown;
  comments?: {
    id: string;
    userId: string;
    text: string;
    createdAt: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskDTO {
  id: string;
  taskGroupId?: string | null;
  title: string;
  description: string;
  status: string;
  priority: string;
  countryCode: string;
  productId: string;
  productName: string;
  productSlug?: string;
  module: string;
  featureModule: string;
  targetSystemId?: string | null;
  targetSystem?: string | null;
  targetSystemUrl?: string | null;
  jiraTicket?: string | null;
  eodTicket?: string | null;
  crNumber?: string | null;
  developer?: string | null;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  signedOffAt?: string | null;
  signedOff?: {
    signedBy: string;
    signedAt: string;
    signatureData?: string;
  };

  updatedBy?: {
    id: string;
    name: string;
    email: string;
  };

  signedOffBy?: {
    id: string;
    name: string;
    email: string;
  };

  assignee?: {
    id: string;
    name: string;
    email: string;
    countryCode: string;
  };

  steps?: TaskStepDTO[];

  comments: {
    id: string;
    body: string;
    createdAt: string;
    author: {
      id: string;
      name: string;
      email: string;
    };
  }[];

  commentCount?: number;
}
