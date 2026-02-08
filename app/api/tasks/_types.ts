export interface TaskDTO {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  countryCode: string;
  module: string;
  dueDate: string;

  assignee?: {
    id: string;
    name: string;
    email: string;
    countryCode: string;
  };

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
}