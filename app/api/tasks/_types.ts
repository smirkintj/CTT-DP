export interface TaskStepDTO {
  id: string;
  order: number;
  description: string;
  expectedResult: string;
  testData?: string | null;
  actualResult?: string | null;
  isPassed?: boolean | null;
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
  title: string;
  description: string;
  status: string;
  priority: string;
  countryCode: string;
  module: string;
  featureModule: string;
  jiraTicket?: string | null;
  crNumber?: string | null;
  developer?: string | null;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  signedOffAt?: string | null;

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
