import prisma from './prisma';

type TeamsEventType = 'TASK_ASSIGNED' | 'REMINDER' | 'SIGNED_OFF' | 'FAILED_STEP';
type TeamsFlagField = 'notifyTaskAssigned' | 'notifyReminder' | 'notifySignedOff' | 'notifyFailedStep';

const eventFieldMap: Record<TeamsEventType, TeamsFlagField> = {
  TASK_ASSIGNED: 'notifyTaskAssigned',
  REMINDER: 'notifyReminder',
  SIGNED_OFF: 'notifySignedOff',
  FAILED_STEP: 'notifyFailedStep'
};

export async function sendTeamsMessage(params: {
  countryCode?: string | null;
  eventType: TeamsEventType;
  title: string;
  text: string;
  taskId?: string;
  facts?: Array<{ name: string; value: string }>;
}): Promise<boolean> {
  if (!params.countryCode) return false;

  const config = await prisma.notificationConfig.findUnique({
    where: { countryCode: params.countryCode }
  });

  if (!config || !config.isActive || !config.teamsWebhookUrl) return false;

  const eventField = eventFieldMap[params.eventType];
  if (!config[eventField]) return false;

  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '');
  const taskUrl = baseUrl && params.taskId ? `${baseUrl}/tasks/${params.taskId}` : undefined;

  const payload = {
    '@type': 'MessageCard',
    '@context': 'https://schema.org/extensions',
    summary: params.title,
    themeColor: 'C8102E',
    title: params.title,
    text: params.text,
    sections: params.facts?.length
      ? [
          {
            facts: params.facts
          }
        ]
      : undefined,
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

  try {
    const response = await fetch(config.teamsWebhookUrl, {
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
  countryCode: string;
  initiatedBy: string;
}): Promise<{ ok: boolean; reason?: 'CONFIG_NOT_FOUND' | 'WEBHOOK_MISSING' | 'DELIVERY_FAILED' }> {
  const config = await prisma.notificationConfig.findUnique({
    where: { countryCode: params.countryCode }
  });

  if (!config) {
    return { ok: false, reason: 'CONFIG_NOT_FOUND' };
  }

  if (!config.teamsWebhookUrl) {
    return { ok: false, reason: 'WEBHOOK_MISSING' };
  }

  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '');
  const payload = {
    '@type': 'MessageCard',
    '@context': 'https://schema.org/extensions',
    summary: `CTT Teams Test (${params.countryCode})`,
    themeColor: '0F172A',
    title: `CTT Teams Test (${params.countryCode})`,
    text: 'This is a test message from the CTT admin portal. If you can see this card, the Teams webhook is working.',
    sections: [
      {
        facts: [
          { name: 'Country', value: params.countryCode },
          { name: 'Initiated By', value: params.initiatedBy },
          { name: 'Environment', value: baseUrl || 'Unknown' },
          { name: 'Timestamp', value: new Date().toLocaleString() }
        ]
      }
    ]
  };

  try {
    const response = await fetch(config.teamsWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return response.ok ? { ok: true } : { ok: false, reason: 'DELIVERY_FAILED' };
  } catch {
    return { ok: false, reason: 'DELIVERY_FAILED' };
  }
}
