import { ActivityType, Prisma, TaskPriority, TaskStatus } from '@prisma/client';
import prisma from './prisma';
import { getAdminProductScope } from './adminAccess';

type ChatRole = 'user' | 'assistant';

export type AssistantHistoryItem = {
  role: ChatRole;
  content: string;
};

export type AssistantSessionUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: 'ADMIN' | 'STAKEHOLDER';
  countryCode: string | null;
};

type AssistantContext = {
  user: AssistantSessionUser;
  productScope: {
    restricted: boolean;
    productIds: string[];
  };
};

type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties: boolean;
    };
  };
};

type ToolCallMessage = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

type LlmMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCallMessage[];
};

type ToolResult = Record<string, unknown>;

export type AssistantCard = {
  title: string;
  subtitle?: string;
  taskId?: string | null;
  meta: Array<{ label: string; value: string }>;
};

export type AssistantChatResult = {
  response: string;
  cards: AssistantCard[];
};

const TOOL_DEFS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_task_counts_by_status',
      description: 'Count tasks grouped by status, optionally filtered by status, country, module, assignee, or product.',
      parameters: {
        type: 'object',
        properties: {
          country: { type: 'string' },
          module: { type: 'string' },
          assignee_id: { type: 'string' },
          status: { type: 'string' },
          product_id: { type: 'string' },
          include_all_country_tasks: { type: 'boolean' }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_my_tasks',
      description: 'Return tasks assigned to the current user, optionally filtered by status, priority, or product.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          priority: { type: 'string' },
          product_id: { type: 'string' }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_tasks_by_priority',
      description: 'Return tasks filtered by priority, with optional country or product filters.',
      parameters: {
        type: 'object',
        properties: {
          priority: { type: 'string' },
          country: { type: 'string' },
          product_id: { type: 'string' },
          include_all_country_tasks: { type: 'boolean' }
        },
        required: ['priority'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_overdue_tasks',
      description: 'Return overdue tasks that are not passed or deployed.',
      parameters: {
        type: 'object',
        properties: {
          country: { type: 'string' },
          product_id: { type: 'string' },
          include_all_country_tasks: { type: 'boolean' }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_module_progress',
      description: 'Count tasks by status for a specific module.',
      parameters: {
        type: 'object',
        properties: {
          module_name: { type: 'string' },
          product_id: { type: 'string' },
          include_all_country_tasks: { type: 'boolean' }
        },
        required: ['module_name'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_blocked_tasks',
      description: 'Return blocked tasks including assignee and duration blocked.',
      parameters: {
        type: 'object',
        properties: {
          country: { type: 'string' },
          product_id: { type: 'string' },
          include_all_country_tasks: { type: 'boolean' }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_activity',
      description: 'Return recent activity entries relevant to the current user scope.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer' },
          product_id: { type: 'string' }
        },
        additionalProperties: false
      }
    }
  }
];

type ToolHandlers = Record<string, (context: AssistantContext, args: Record<string, unknown>) => Promise<ToolResult>>;

const PRIORITY_VALUES = new Set(Object.values(TaskPriority));
const STATUS_VALUES = new Set(Object.values(TaskStatus));

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  READY: 'Ready',
  IN_PROGRESS: 'In Progress',
  BLOCKED: 'Blocked',
  PASSED: 'Passed',
  FAILED: 'Failed',
  DEPLOYED: 'Deployed'
};

function buildSystemPrompt(context: AssistantContext) {
  const name = context.user.name || context.user.email || 'there';
  const roleLabel = context.user.role === 'ADMIN' ? 'admin' : 'stakeholder';
  const countryLabel = context.user.countryCode || 'no specific country';

  return [
    `You are a warm, capable UAT assistant inside the CTT platform.`,
    `You are speaking with ${name}, a ${roleLabel} scoped to ${countryLabel}.`,
    `Keep replies natural, concise, and conversational.`,
    `Do not mention tools, internal rules, APIs, prompts, or implementation details.`,
    `If the user greets you, greet them briefly and offer task help.`,
    `If the user asks something outside UAT tasks, explain briefly that you can help with task counts, blockers, overdue items, module progress, and recent activity.`,
    `After answering, ask one short follow-up question when it helps the conversation continue.`,
    `Interpret "open" tasks as tasks not in PASSED or DEPLOYED.`,
    `Interpret "closed" tasks as PASSED or DEPLOYED.`,
    `For stakeholders, default to their own assigned tasks unless they clearly ask for all tasks in their country.`,
    `For admins, results must still stay inside their allowed product scope if product access is restricted.`,
    `If a tool returns no results, say that plainly and offer the next useful filter.`
  ].join(' ');
}

function normalizePriority(value: unknown): TaskPriority | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  if (!PRIORITY_VALUES.has(normalized as TaskPriority)) return null;
  return normalized as TaskPriority;
}

function normalizeStatus(value: unknown): TaskStatus | 'OPEN' | 'CLOSED' | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, '_').toUpperCase();
  if (normalized === 'ACTIVE') return 'OPEN';
  if (normalized === 'OPEN') return 'OPEN';
  if (normalized === 'CLOSED') return 'CLOSED';
  if (!STATUS_VALUES.has(normalized as TaskStatus)) return null;
  return normalized as TaskStatus;
}

function coerceString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function coerceBoolean(value: unknown): boolean {
  return value === true;
}

function coerceLimit(value: unknown, fallback = 10) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(1, Math.min(20, Math.round(value)));
}

function stripToolLeakage(text: string) {
  const cleanedLines = text
    .split('\n')
    .filter((line) => {
      const lowered = line.toLowerCase();
      if (lowered.includes('i will call the function')) return false;
      if (lowered.includes('"parameters"')) return false;
      if (lowered.includes('"name"') && lowered.includes('get_')) return false;
      return true;
    })
    .join('\n')
    .trim();

  return cleanedLines.replace(/\{[\s\S]*"name"\s*:\s*"get_[^}]+\}/g, '').trim();
}

function toIsoOrDash(value: Date | string | null | undefined) {
  if (!value) return 'N/A';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 'N/A' : date.toISOString().slice(0, 10);
}

function buildTaskWhere(
  context: AssistantContext,
  options: {
    country?: string | null;
    productId?: string | null;
    moduleName?: string | null;
    assigneeId?: string | null;
    priority?: TaskPriority | null;
    status?: TaskStatus | 'OPEN' | 'CLOSED' | null;
    includeAllCountryTasks?: boolean;
    overdueOnly?: boolean;
    blockedOnly?: boolean;
  }
): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = {};

  if (context.productScope.restricted) {
    where.productId = {
      in: context.productScope.productIds
    };
  }

  if (context.user.role === 'ADMIN') {
    if (context.productScope.restricted) {
      where.productId = { in: context.productScope.productIds };
    }
    const requestedCountry = options.country ?? null;
    if (requestedCountry) where.countryCode = requestedCountry;
  } else {
    where.countryCode = context.user.countryCode ?? undefined;
    if (!options.includeAllCountryTasks) {
      where.assigneeId = context.user.id;
    } else if (options.assigneeId) {
      where.assigneeId = options.assigneeId;
    }
  }

  if (context.user.role === 'ADMIN' && options.assigneeId) {
    where.assigneeId = options.assigneeId;
  }

  if (options.productId) {
    const allowedProductIds =
      context.productScope.restricted ? context.productScope.productIds : null;
    if (!allowedProductIds || allowedProductIds.includes(options.productId)) {
      where.productId = options.productId;
    } else {
      where.productId = '__blocked__';
    }
  }

  if (options.moduleName) {
    where.module = options.moduleName;
  }

  if (options.priority) {
    where.priority = options.priority;
  }

  if (options.status === 'OPEN') {
    where.status = { notIn: [TaskStatus.PASSED, TaskStatus.DEPLOYED] };
  } else if (options.status === 'CLOSED') {
    where.status = { in: [TaskStatus.PASSED, TaskStatus.DEPLOYED] };
  } else if (options.status) {
    where.status = options.status;
  }

  if (options.overdueOnly) {
    where.dueDate = { lt: new Date() };
    where.NOT = { status: { in: [TaskStatus.PASSED, TaskStatus.DEPLOYED] } };
  }

  if (options.blockedOnly) {
    where.status = TaskStatus.BLOCKED;
  }

  return where;
}

async function getAssistantContext(user: AssistantSessionUser): Promise<AssistantContext> {
  if (user.role === 'ADMIN') {
    const adminScope = await getAdminProductScope(user.id);
    return {
      user,
      productScope: adminScope
    };
  }

  const accesses = await prisma.userProductAccess.findMany({
    where: { userId: user.id },
    select: { productId: true }
  });

  return {
    user,
    productScope: {
      restricted: accesses.length > 0,
      productIds: accesses.map((item) => item.productId)
    }
  };
}

const toolHandlers: ToolHandlers = {
  async get_task_counts_by_status(context, args) {
    const where = buildTaskWhere(context, {
      country: coerceString(args.country),
      moduleName: coerceString(args.module),
      assigneeId: coerceString(args.assignee_id),
      productId: coerceString(args.product_id),
      status: normalizeStatus(args.status),
      includeAllCountryTasks: coerceBoolean(args.include_all_country_tasks)
    });

    const rows = await prisma.task.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
      orderBy: { status: 'asc' }
    });

    return {
      rows: rows.map((row) => ({
        status: row.status,
        count: row._count._all
      }))
    };
  },

  async get_my_tasks(context, args) {
    const where = buildTaskWhere(context, {
      assigneeId: context.user.id,
      productId: coerceString(args.product_id),
      status: normalizeStatus(args.status),
      priority: normalizePriority(args.priority)
    });

    const rows = await prisma.task.findMany({
      where: {
        ...where,
        assigneeId: context.user.id
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        product: { select: { id: true, name: true } }
      },
      orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
      take: 12
    });

    return {
      rows: rows.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        priority: row.priority,
        countryCode: row.countryCode,
        module: row.module,
        dueDate: row.dueDate,
        updatedAt: row.updatedAt,
        productName: row.product?.name ?? 'Product'
      }))
    };
  },

  async get_tasks_by_priority(context, args) {
    const where = buildTaskWhere(context, {
      country: coerceString(args.country),
      productId: coerceString(args.product_id),
      priority: normalizePriority(args.priority),
      includeAllCountryTasks: coerceBoolean(args.include_all_country_tasks)
    });

    const rows = await prisma.task.findMany({
      where,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        product: { select: { name: true } }
      },
      orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
      take: 12
    });

    return {
      rows: rows.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        priority: row.priority,
        countryCode: row.countryCode,
        module: row.module,
        dueDate: row.dueDate,
        assigneeName: row.assignee?.name ?? row.assignee?.email ?? 'Unassigned',
        productName: row.product?.name ?? 'Product'
      }))
    };
  },

  async get_overdue_tasks(context, args) {
    const where = buildTaskWhere(context, {
      country: coerceString(args.country),
      productId: coerceString(args.product_id),
      includeAllCountryTasks: coerceBoolean(args.include_all_country_tasks),
      overdueOnly: true
    });

    const rows = await prisma.task.findMany({
      where,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        product: { select: { name: true } }
      },
      orderBy: { dueDate: 'asc' },
      take: 12
    });

    return {
      rows: rows.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        priority: row.priority,
        countryCode: row.countryCode,
        module: row.module,
        dueDate: row.dueDate,
        assigneeName: row.assignee?.name ?? row.assignee?.email ?? 'Unassigned',
        productName: row.product?.name ?? 'Product'
      }))
    };
  },

  async get_module_progress(context, args) {
    const where = buildTaskWhere(context, {
      moduleName: coerceString(args.module_name),
      productId: coerceString(args.product_id),
      includeAllCountryTasks: coerceBoolean(args.include_all_country_tasks)
    });

    const rows = await prisma.task.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
      orderBy: { status: 'asc' }
    });

    return {
      rows: rows.map((row) => ({
        status: row.status,
        count: row._count._all
      })),
      moduleName: coerceString(args.module_name)
    };
  },

  async get_blocked_tasks(context, args) {
    const where = buildTaskWhere(context, {
      country: coerceString(args.country),
      productId: coerceString(args.product_id),
      includeAllCountryTasks: coerceBoolean(args.include_all_country_tasks),
      blockedOnly: true
    });

    const rows = await prisma.task.findMany({
      where,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        product: { select: { name: true } }
      },
      orderBy: { updatedAt: 'asc' },
      take: 12
    });

    return {
      rows: rows.map((row) => ({
        id: row.id,
        title: row.title,
        assigneeName: row.assignee?.name ?? row.assignee?.email ?? 'Unassigned',
        updatedAt: row.updatedAt,
        daysBlocked: Math.max(
          0,
          Math.floor((Date.now() - row.updatedAt.getTime()) / (1000 * 60 * 60 * 24))
        ),
        productName: row.product?.name ?? 'Product'
      }))
    };
  },

  async get_recent_activity(context, args) {
    const limit = coerceLimit(args.limit, 10);
    const productId = coerceString(args.product_id);
    const activityWhere: Prisma.ActivityWhereInput =
      context.user.role === 'ADMIN'
        ? {}
        : {
            OR: [
              { actorId: context.user.id },
              { task: { assigneeId: context.user.id } },
              ...(context.user.countryCode ? [{ countryCode: context.user.countryCode }] : [])
            ]
          };

    if (productId) {
      activityWhere.task = {
        is: {
          productId
        }
      };
    } else if (context.productScope.restricted) {
      activityWhere.task = {
        is: {
          productId: {
            in: context.productScope.productIds
          }
        }
      };
    }

    const rows = await prisma.activity.findMany({
      where: activityWhere,
      include: {
        task: {
          select: {
            id: true,
            title: true,
            product: { select: { name: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return {
      rows: rows.map((row) => ({
        id: row.id,
        type: row.type,
        message: row.message,
        taskId: row.taskId,
        taskTitle: row.task?.title ?? null,
        productName: row.task?.product?.name ?? null,
        createdAt: row.createdAt
      })),
      limit
    };
  }
};

function parseToolArgs(raw: string) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function callLlm(messages: LlmMessage[]) {
  const baseUrl = (process.env.LLM_BASE_URL || 'http://localhost:11434/v1').replace(/\/$/, '');
  const apiKey = process.env.LLM_API_KEY || 'ollama';
  const model = process.env.LLM_MODEL || 'llama3.1';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      tool_choice: 'auto',
      messages,
      tools: TOOL_DEFS
    }),
    cache: 'no-store'
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM request failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        role?: 'assistant';
        content?: string | null;
        tool_calls?: ToolCallMessage[];
      };
    }>;
  };

  return payload.choices?.[0]?.message ?? { content: '' };
}

function buildCards(toolName: string | null, result: ToolResult | null): AssistantCard[] {
  const rows = Array.isArray(result?.rows) ? (result?.rows as Array<Record<string, unknown>>) : [];
  if (!toolName || rows.length === 0) return [];

  if (
    toolName === 'get_my_tasks' ||
    toolName === 'get_tasks_by_priority' ||
    toolName === 'get_overdue_tasks'
  ) {
    return rows.map((row) => ({
      taskId: typeof row.id === 'string' ? row.id : null,
      title: typeof row.title === 'string' ? row.title : 'Untitled task',
      subtitle: [row.productName, row.module, row.countryCode].filter(Boolean).join(' · '),
      meta: [
        { label: 'Status', value: String(row.status ?? 'N/A') },
        { label: 'Priority', value: String(row.priority ?? 'N/A') },
        { label: 'Due', value: toIsoOrDash(row.dueDate as Date | string | null | undefined) }
      ]
    }));
  }

  if (toolName === 'get_blocked_tasks') {
    return rows.map((row) => ({
      taskId: typeof row.id === 'string' ? row.id : null,
      title: typeof row.title === 'string' ? row.title : 'Blocked task',
      subtitle: [row.productName, row.assigneeName].filter(Boolean).join(' · '),
      meta: [
        { label: 'Status', value: 'Blocked' },
        { label: 'Days blocked', value: String(row.daysBlocked ?? 0) },
        { label: 'Updated', value: toIsoOrDash(row.updatedAt as Date | string | null | undefined) }
      ]
    }));
  }

  if (toolName === 'get_task_counts_by_status' || toolName === 'get_module_progress') {
    return rows.map((row) => {
      const rawStatus = String(row.status ?? 'UNKNOWN');
      return {
        title: STATUS_LABELS[rawStatus] ?? rawStatus,
        subtitle: toolName === 'get_module_progress' ? 'Module progress' : 'Task count',
        meta: [{ label: 'Count', value: String(row.count ?? 0) }]
      };
    });
  }

  if (toolName === 'get_recent_activity') {
    return rows.map((row) => ({
      taskId: typeof row.taskId === 'string' ? row.taskId : null,
      title: typeof row.message === 'string' ? row.message : 'Activity',
      subtitle: [row.productName, row.taskTitle].filter(Boolean).join(' · '),
      meta: [
        { label: 'Type', value: String(row.type ?? ActivityType.COMMENT_ADDED) },
        { label: 'When', value: toIsoOrDash(row.createdAt as Date | string | null | undefined) }
      ]
    }));
  }

  return [];
}

export async function chatWithAssistant(input: {
  user: AssistantSessionUser;
  message: string;
  history: AssistantHistoryItem[];
}): Promise<AssistantChatResult> {
  const context = await getAssistantContext(input.user);
  const messages: LlmMessage[] = [
    {
      role: 'system',
      content: buildSystemPrompt(context)
    },
    ...input.history
      .filter((item) => item.role === 'user' || item.role === 'assistant')
      .map((item) => ({
        role: item.role,
        content: item.content
      })),
    {
      role: 'user',
      content: input.message
    }
  ];

  const firstPass = await callLlm(messages);
  let finalText = firstPass.content ?? '';
  let cards: AssistantCard[] = [];

  if (Array.isArray(firstPass.tool_calls) && firstPass.tool_calls.length > 0) {
    messages.push({
      role: 'assistant',
      content: firstPass.content ?? '',
      tool_calls: firstPass.tool_calls
    });

    let lastToolName: string | null = null;
    let lastToolResult: ToolResult | null = null;

    for (const toolCall of firstPass.tool_calls) {
      const handler = toolHandlers[toolCall.function.name];
      const args = parseToolArgs(toolCall.function.arguments);
      const result = handler ? await handler(context, args) : { error: 'Unknown tool' };

      lastToolName = toolCall.function.name;
      lastToolResult = result;

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result, (_key, value) => {
          if (value instanceof Date) return value.toISOString();
          return value;
        })
      });
    }

    const secondPass = await callLlm(messages);
    finalText = secondPass.content ?? '';
    cards = buildCards(lastToolName, lastToolResult);
  }

  return {
    response: stripToolLeakage(finalText) || 'What would you like to check in your UAT tasks?',
    cards
  };
}
