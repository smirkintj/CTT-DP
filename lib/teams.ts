import prisma from './prisma';
import { decryptField } from './encrypt';

type TeamsEventType = 'TASK_ASSIGNED' | 'REMINDER' | 'SIGNED_OFF' | 'FAILED_STEP';
type TeamsFlagField = 'notifyTaskAssigned' | 'notifyReminder' | 'notifySignedOff' | 'notifyFailedStep';

const eventFieldMap: Record<TeamsEventType, TeamsFlagField> = {
  TASK_ASSIGNED: 'notifyTaskAssigned',
  REMINDER: 'notifyReminder',
  SIGNED_OFF: 'notifySignedOff',
  FAILED_STEP: 'notifyFailedStep'
};

export type TeamsMessageParams = {
  countryCode?: string | null;
  productId?: string | null;   // ADD THIS
  eventType: TeamsEventType;
  taskId?: string;
  taskTitle: string;
  productName?: string | null;
  module?: string | null;
  targetSystemUrl?: string | null;
  dueDate?: Date | string | null;
  actorName?: string | null;
  taskStatus?: string | null;
  signedOffAt?: Date | string | null;
};

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function buildPayload(params: TeamsMessageParams, taskUrl: string | undefined): object {
  const {
    eventType,
    taskTitle,
    productName,
    module,
    targetSystemUrl,
    dueDate,
    actorName,
    taskStatus,
    countryCode,
    signedOffAt
  } = params;

  const timestamp = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const teamLabel = countryCode ? `${countryCode} Team` : 'Team';
  const actor = actorName || 'Admin';
  const product = productName || 'the portal';

  type CardConfig = {
    themeColor: string;
    summary: string;
    activityTitle: string;
    activitySubtitle: string;
    sentence: string;
    facts: Array<{ name: string; value: string }>;
  };

  const configs: Record<TeamsEventType, CardConfig> = {
    TASK_ASSIGNED: {
      themeColor: '0078d4',
      summary: 'New UAT Task Assigned',
      activityTitle: `**${actor}** assigned a task`,
      activitySubtitle: `${productName || ''} · ${timestamp}`,
      sentence: `Hi **${teamLabel}**, a new UAT task has been assigned on **${product}**. Please review and begin testing by the due date.`,
      facts: [
        { name: 'Task', value: taskTitle },
        ...(dueDate ? [{ name: 'Due Date', value: `**${formatDate(dueDate)}**` }] : []),
        ...(module ? [{ name: 'Module', value: module }] : []),
        ...(targetSystemUrl ? [{ name: 'Test URL', value: `[Open Environment](${targetSystemUrl})` }] : [])
      ]
    },
    SIGNED_OFF: {
      themeColor: '107c10',
      summary: 'UAT Task Signed Off',
      activityTitle: `**${actor}** signed off a task`,
      activitySubtitle: `${productName || ''} · ${timestamp}`,
      sentence: `**${actor}** has signed off on a UAT task in **${product}**. This task is now complete.`,
      facts: [
        { name: 'Task', value: taskTitle },
        { name: 'Product', value: productName || 'N/A' },
        ...(module ? [{ name: 'Module', value: module }] : []),
        { name: 'Signed Off By', value: `**${actor}**` },
        { name: 'Date', value: formatDate(signedOffAt || new Date()) }
      ]
    },
    REMINDER: {
      themeColor: 'f59e0b',
      summary: 'UAT Task Reminder',
      activityTitle: `Reminder — task pending completion`,
      activitySubtitle: `${productName || ''} · Due ${formatDate(dueDate)}`,
      sentence: `Hi **${teamLabel}**, a UAT task on **${product}** is due soon. Please ensure it is completed before the due date.`,
      facts: [
        { name: 'Task', value: taskTitle },
        ...(dueDate ? [{ name: 'Due Date', value: `**${formatDate(dueDate)}**` }] : []),
        ...(module ? [{ name: 'Module', value: module }] : []),
        ...(taskStatus ? [{ name: 'Status', value: taskStatus }] : [])
      ]
    },
    FAILED_STEP: {
      themeColor: 'c8102e',
      summary: 'UAT Step Failed',
      activityTitle: `**${actor}** marked a step as failed`,
      activitySubtitle: `${productName || ''} · ${timestamp}`,
      sentence: `A step in a UAT task on **${product}** has been marked as **Failed** and requires attention.`,
      facts: [
        { name: 'Task', value: taskTitle },
        { name: 'Product', value: productName || 'N/A' },
        ...(module ? [{ name: 'Module', value: module }] : []),
        { name: 'Marked By', value: actor },
        { name: 'Date', value: timestamp }
      ]
    }
  };

  const cfg = configs[eventType];

  return {
    '@type': 'MessageCard',
    '@context': 'https://schema.org/extensions',
    summary: cfg.summary,
    themeColor: cfg.themeColor,
    sections: [
      {
        activityTitle: cfg.activityTitle,
        activitySubtitle: cfg.activitySubtitle
      },
      {
        text: cfg.sentence,
        facts: cfg.facts
      }
    ],
    potentialAction: taskUrl
      ? [
          {
            '@type': 'OpenUri',
            name: 'Open Task',
            targets: [{ os: 'default', uri: taskUrl }]
          }
        ]
      : undefined
  };
}

export async function sendTeamsMessage(params: TeamsMessageParams): Promise<boolean> {
  if (!params.countryCode) return false;

  if (!params.productId) return false;
  const config = await prisma.notificationConfig.findUnique({
    where: { productId_countryCode: { productId: params.productId, countryCode: params.countryCode } }
  });

  if (!config || !config.isActive) return false;

  const webhookUrl = decryptField(config.teamsWebhookUrl);
  if (!webhookUrl) return false;

  const eventField = eventFieldMap[params.eventType];
  if (!config[eventField]) return false;

  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '');
  const taskUrl = baseUrl && params.taskId ? `${baseUrl}/tasks/${params.taskId}` : undefined;

  const payload = buildPayload(params, taskUrl);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function sendTeamsTestMessage(params: {
  productId: string;
  countryCode: string;
  initiatedBy: string;
}): Promise<{ ok: boolean; reason?: 'CONFIG_NOT_FOUND' | 'WEBHOOK_MISSING' | 'DELIVERY_FAILED' }> {
  const config = await prisma.notificationConfig.findUnique({
    where: { productId_countryCode: { productId: params.productId, countryCode: params.countryCode } }
  });

  if (!config) {
    return { ok: false, reason: 'CONFIG_NOT_FOUND' };
  }

  const webhookUrl = decryptField(config.teamsWebhookUrl);
  if (!webhookUrl) {
    return { ok: false, reason: 'WEBHOOK_MISSING' };
  }

  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '');
  const payload = {
    '@type': 'MessageCard',
    '@context': 'https://schema.org/extensions',
    summary: `CTT Teams Test (${params.countryCode})`,
    themeColor: '0F172A',
    sections: [
      {
        activityTitle: `**${params.initiatedBy}** sent a test notification`,
        activitySubtitle: `${params.countryCode} · ${new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`
      },
      {
        text: `This is a test message from the CTT admin portal. If you can see this card, the Teams webhook for **${params.countryCode}** is working correctly.`,
        facts: [
          { name: 'Country', value: params.countryCode },
          { name: 'Initiated By', value: params.initiatedBy },
          { name: 'Environment', value: baseUrl || 'Unknown' }
        ]
      }
    ]
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return response.ok ? { ok: true } : { ok: false, reason: 'DELIVERY_FAILED' };
  } catch {
    return { ok: false, reason: 'DELIVERY_FAILED' };
  }
}
