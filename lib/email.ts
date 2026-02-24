type TaskAssignedEmailInput = {
  to: string;
  assigneeName?: string;
  taskTitle: string;
  taskId?: string;
  countryCode?: string;
  dueDate?: string | Date | null;
};

type TaskReminderEmailInput = {
  to: string;
  recipientName?: string;
  taskTitle: string;
  taskId?: string;
  daysLeft?: number;
  dueDate?: string | Date | null;
};

type TaskSignedOffEmailInput = {
  to: string;
  cc?: string | string[];
  recipientName?: string;
  taskTitle: string;
  taskId?: string;
  signedOffBy: string;
  signedOffAt?: string | Date;
};

function formatDate(value?: string | Date | null): string {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function getTaskUrl(taskId?: string): string | undefined {
  if (!taskId) return undefined;
  const baseUrl = process.env.NEXTAUTH_URL;
  if (!baseUrl) return undefined;
  return `${baseUrl.replace(/\/$/, '')}/tasks/${taskId}`;
}

function createTemplate(title: string, intro: string, lines: string[], cta?: { label: string; href: string }) {
  const bodyLines = lines
    .map((line) => `<p style="margin:0 0 8px 0;color:#334155;font-size:14px;line-height:1.5;">${line}</p>`)
    .join("");

  const ctaHtml = cta
    ? `<a href="${cta.href}" style="display:inline-block;background:#C8102E;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:600;font-size:14px;">${cta.label}</a>`
    : "";

  return `
  <div style="background:#F8FAFC;padding:24px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
      <div style="background:#C8102E;padding:16px 20px;">
        <p style="margin:0;color:#ffffff;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">DKSH - CTT</p>
        <h1 style="margin:6px 0 0 0;color:#ffffff;font-size:20px;line-height:1.3;">${title}</h1>
      </div>
      <div style="padding:20px;">
        <p style="margin:0 0 12px 0;color:#0F172A;font-size:14px;line-height:1.5;">${intro}</p>
        ${bodyLines}
        ${ctaHtml ? `<div style="margin-top:16px;">${ctaHtml}</div>` : ""}
      </div>
      <div style="padding:12px 20px;background:#F1F5F9;border-top:1px solid #E2E8F0;">
        <p style="margin:0;color:#64748B;font-size:12px;">Automated message from CTT UAT System</p>
      </div>
    </div>
  </div>`;
}

async function sendEmail(input: {
  to: string;
  cc?: string | string[];
  subject: string;
  html: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Email config missing: RESEND_API_KEY and/or EMAIL_FROM");
    }
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        ...(input.cc
          ? {
              cc: Array.isArray(input.cc) ? input.cc : [input.cc]
            }
          : {}),
        subject: input.subject,
        html: input.html
      })
    });

    if (!response.ok && process.env.NODE_ENV !== "production") {
      const errorText = await response.text();
      console.error("Resend error:", response.status, errorText);
    }

    return response.ok;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("sendEmail failed:", error);
    }
    return false;
  }
}

export async function sendTaskAssignedEmail(input: TaskAssignedEmailInput): Promise<boolean> {
  const intro = `A UAT task has been assigned to ${input.assigneeName || "you"}.`;
  const html = createTemplate(
    "Task Assigned",
    intro,
    [
      `Task: <strong>${input.taskTitle}</strong>`,
      `Country: <strong>${input.countryCode || "N/A"}</strong>`,
      `Due Date: <strong>${formatDate(input.dueDate)}</strong>`
    ],
    getTaskUrl(input.taskId) ? { label: "Open Task", href: getTaskUrl(input.taskId)! } : undefined
  );

  return sendEmail({ to: input.to, subject: `Task Assigned: ${input.taskTitle}`, html });
}

export async function sendTaskReminderEmail(input: TaskReminderEmailInput): Promise<boolean> {
  const intro = `Reminder for ${input.recipientName || "you"} to complete a pending UAT task.`;
  const daysLeft =
    typeof input.daysLeft === "number" ? ` (${input.daysLeft} day${input.daysLeft === 1 ? "" : "s"} left)` : "";

  const html = createTemplate(
    "Task Reminder",
    intro,
    [
      `Task: <strong>${input.taskTitle}</strong>${daysLeft}`,
      `Due Date: <strong>${formatDate(input.dueDate)}</strong>`
    ],
    getTaskUrl(input.taskId) ? { label: "Open Task", href: getTaskUrl(input.taskId)! } : undefined
  );

  return sendEmail({ to: input.to, subject: `Task Reminder: ${input.taskTitle}`, html });
}

export async function sendTaskSignedOffEmail(input: TaskSignedOffEmailInput): Promise<boolean> {
  const intro = `A UAT task has been signed off and is ready for the next step.`;
  const html = createTemplate(
    "Task Signed Off",
    intro,
    [
      `Task: <strong>${input.taskTitle}</strong>`,
      `Signed Off By: <strong>${input.signedOffBy}</strong>`,
      `Signed Off At: <strong>${formatDate(input.signedOffAt)}</strong>`
    ],
    getTaskUrl(input.taskId) ? { label: "Review Task", href: getTaskUrl(input.taskId)! } : undefined
  );

  return sendEmail({
    to: input.to,
    cc: input.cc,
    subject: `Task Signed Off: ${input.taskTitle}`,
    html
  });
}
