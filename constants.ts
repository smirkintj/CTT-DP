import { CountryConfig, Priority, Role, Status, Task, User, Notification } from './types';

export const INITIAL_COUNTRIES: CountryConfig[] = [
  { code: 'TH', name: 'Thailand', color: 'bg-pink-100 text-pink-700' },
  { code: 'SG', name: 'Singapore', color: 'bg-cyan-100 text-cyan-700' },
  { code: 'VN', name: 'Vietnam', color: 'bg-yellow-100 text-yellow-700' },
  { code: 'MY', name: 'Malaysia', color: 'bg-blue-100 text-blue-700' },
  { code: 'TW', name: 'Taiwan', color: 'bg-emerald-100 text-emerald-700' },
  { code: 'HK', name: 'Hong Kong', color: 'bg-red-100 text-red-700' },
];

export const INITIAL_MODULES = [
  'Ordering',
  'Pricing',
  'Reporting',
  'Integration',
  'Account',
  'Promotions',
  'Returns'
];

export const MOCK_USERS: User[] = [
  {
    id: 'u1',
    name: 'Sarah Chen',
    email: 'sarah.c@company.com',
    role: Role.STAKEHOLDER,
    countryCode: 'SG',
    avatarUrl: 'https://picsum.photos/100/100',
  },
  {
    id: 'u2',
    name: 'Alex Miller',
    email: 'alex.m@company.com',
    role: Role.ADMIN,
    countryCode: 'SG',
    avatarUrl: 'https://picsum.photos/101/101',
  },
];

export const MOCK_TASKS: Task[] = [
  {
    id: 't1',
    title: 'Verify Order Creation flow for Wholesale Customers',
    description: 'Ensure that wholesale customers get the correct bulk discount applied automatically upon cart creation.',
    featureModule: 'Ordering',
    status: Status.PENDING,
    priority: Priority.HIGH,
    countryCode: 'SG',
    assigneeId: 'u1',
    dueDate: '2023-11-15',
    updatedAt: '2 hrs ago',
    jiraTicket: 'CTT-402',
    crNumber: 'CR-2023-909',
    developer: 'John Doe',
    scope: 'Global',
    targetSystem: 'Ordering Portal',
    referenceVideoUrl: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3R6eW55b3R6eW55b3R6eW55b3R6eW55b3R6eW55b3R6eW55b3R6eW55/3o7TKSjRrfIPjeiVyM/giphy.gif', // Placeholder
    steps: [
      { 
        id: 's1', 
        description: 'Log in as a wholesale user', 
        expectedResult: 'Dashboard loads with wholesale pricing.',
        testData: 'User: wholesale_test@dksh.com / Pass: Demo1234',
        isPassed: null,
        comments: []
      },
      { 
        id: 's2', 
        description: 'Add 50 units of SKU-123 to cart', 
        expectedResult: 'Cart total reflects 15% discount.',
        testData: 'SKU-123 (Baby Powder 500g)',
        isPassed: null,
        comments: []
      },
      { 
        id: 's3', 
        description: 'Proceed to checkout', 
        expectedResult: 'No shipping fees applied.',
        isPassed: null,
        comments: []
      },
    ],
  },
  {
    id: 't2',
    title: 'Check PDF Invoice Generation',
    description: 'The localized tax ID needs to appear on the top right corner of the PDF invoice.',
    featureModule: 'Reporting',
    status: Status.IN_PROGRESS,
    priority: Priority.MEDIUM,
    countryCode: 'SG',
    assigneeId: 'u1',
    dueDate: '2023-11-16',
    updatedAt: '1 day ago',
    jiraTicket: 'CTT-305',
    developer: 'Jane Smith',
    scope: 'Local',
    targetSystem: 'Ordering Portal',
    steps: [
      { id: 's1', description: 'Navigate to Order History', expectedResult: 'List of past orders appears.', isPassed: true, completedAt: '2023-11-14 10:00 AM', comments: [] },
      { id: 's2', description: 'Click "Download Invoice" on last order', expectedResult: 'PDF downloads successfully.', isPassed: true, completedAt: '2023-11-14 10:05 AM', comments: [] },
      { 
        id: 's3', 
        description: 'Open PDF', 
        expectedResult: 'Tax ID is present in header.', 
        isPassed: null,
        comments: [
           { id: 'c1', userId: 'u2', text: 'Please check if the font supports Thai characters as well.', createdAt: '5 hrs ago' }
        ]
      },
    ],
  },
  {
    id: 't3',
    title: 'SAP Integration: Inventory Sync',
    description: 'Inventory levels should decrease in real-time after order placement.',
    featureModule: 'Integration',
    status: Status.FAILED,
    priority: Priority.CRITICAL,
    countryCode: 'TH',
    assigneeId: 'u3',
    dueDate: '2023-11-10',
    updatedAt: '3 days ago',
    jiraTicket: 'CTT-112',
    crNumber: 'CR-SAP-001',
    developer: 'Michael Wong',
    scope: 'Regional',
    targetSystem: 'Ordering Portal',
    steps: [
      { id: 's1', description: 'Place order for 1 item', expectedResult: 'Order success.', isPassed: true, comments: [] },
      { 
        id: 's2', 
        description: 'Check SAP backend', 
        expectedResult: 'Stock count -1.', 
        actualResult: 'Stock count remained the same. API timeout error observed.',
        isPassed: false,
        completedAt: '2023-11-10 02:00 PM',
        comments: [
          { id: 'c2', userId: 'u2', text: '@MichaelWong can you check the API logs?', createdAt: '2 days ago' }
        ]
      },
    ],
  },
  {
    id: 't4',
    title: 'User Profile Update',
    description: 'Users should be able to update their phone numbers.',
    featureModule: 'Account',
    status: Status.DEPLOYED,
    priority: Priority.LOW,
    countryCode: 'VN',
    assigneeId: 'u4',
    dueDate: '2023-11-12',
    updatedAt: '1 week ago',
    jiraTicket: 'CTT-550',
    developer: 'Sarah Chen',
    scope: 'Global',
    targetSystem: 'Admin Portal',
    deployment: {
      isDeployed: true,
      deployedAt: '2023-11-15',
      releaseVersion: 'v2.4.1',
      deployedBy: 'Alex Miller'
    },
    signedOff: {
      signedBy: 'Sarah Chen',
      signedAt: '2023-11-12 14:30'
    },
    steps: [
       { id: 's1', description: 'Change phone number', expectedResult: 'Save successful', isPassed: true, completedAt: '2023-11-12', comments: [] }
    ],
  },
  {
    id: 't5',
    title: 'Price Override Logic',
    description: 'Sales managers should be able to manually override price in cart.',
    featureModule: 'Pricing',
    status: Status.BLOCKED,
    priority: Priority.HIGH,
    countryCode: 'MY',
    assigneeId: 'u5',
    dueDate: '2023-11-18',
    updatedAt: '10 mins ago',
    jiraTicket: 'CTT-404',
    developer: 'John Doe',
    scope: 'Regional',
    targetSystem: 'Ordering Portal',
    steps: [
       { id: 's1', description: 'Add item to cart', expectedResult: 'Item added', isPassed: true, comments: [] },
       { id: 's2', description: 'Attempt override', expectedResult: 'Popup appears', actualResult: 'Button is grayed out due to SAP Maintenance.', isPassed: false, comments: [] }
    ],
  },
];

export const MOCK_NOTIFICATIONS: Notification[] = [
  // Admin Notifications
  {
    id: 'n1',
    userId: 'u2',
    type: 'ALERT',
    message: 'Task "SAP Integration" marked as FAILED in Thailand.',
    time: '10 mins ago',
    isRead: false,
    relatedTaskId: 't3'
  },
  {
    id: 'n2',
    userId: 'u2',
    type: 'SUCCESS',
    message: 'Sarah Chen completed "User Profile Update".',
    time: '1 hour ago',
    isRead: false,
    relatedTaskId: 't4'
  },
  {
    id: 'n3',
    userId: 'u2',
    type: 'MENTION',
    message: 'New comment from Alex: "Please check font support..."',
    time: '2 hours ago',
    isRead: true,
    relatedTaskId: 't2'
  },
  
  // Stakeholder Notifications
  {
    id: 'n4',
    userId: 'u1',
    type: 'INFO',
    message: 'New task assigned: "Verify Order Creation".',
    time: '3 hours ago',
    isRead: false,
    relatedTaskId: 't1'
  },
  {
    id: 'n5',
    userId: 'u1',
    type: 'ALERT',
    message: 'Task "Check PDF Invoice" is due tomorrow.',
    time: '5 hours ago',
    isRead: true,
    relatedTaskId: 't2'
  }
];
