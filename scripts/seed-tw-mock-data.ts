import { ActivityType, PrismaClient, TaskPriority, TaskStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TW_EMAIL = 'uat-tw@dksh.com';

const taskTemplates = [
  // EasyOrder scenarios
  { title: 'EasyOrder: Order Submission – Standard Flow', module: 'Ordering', description: 'Verify end-to-end order submission with standard SKUs.', steps: ['Open ordering portal and log in as TW distributor', 'Add 3 SKUs to cart and proceed to checkout', 'Submit order and confirm order number is generated'], priority: TaskPriority.HIGH, status: TaskStatus.IN_PROGRESS },
  { title: 'EasyOrder: Order Submission – Rush Order', module: 'Ordering', description: 'Test rush order flag on urgent SKUs.', steps: ['Select rush order toggle during checkout', 'Verify rush order badge appears on order summary', 'Confirm expedited delivery date is shown'], priority: TaskPriority.HIGH, status: TaskStatus.READY },
  { title: 'EasyOrder: Order Amendment After Submission', module: 'Ordering', description: 'Validate amendment flow within the allowed window.', steps: ['Submit a standard order', 'Navigate to order history and click Amend', 'Modify quantity on one SKU and resubmit'], priority: TaskPriority.MEDIUM, status: TaskStatus.READY },
  { title: 'EasyOrder: Pricing – Volume Discount Tiers', module: 'Pricing', description: 'Confirm volume discount tiers apply correctly at checkout.', steps: ['Add <10 units and note unit price', 'Increase to 50 units and verify Tier 2 discount is applied', 'Increase to 100 units and verify Tier 3 discount'], priority: TaskPriority.HIGH, status: TaskStatus.PASSED, signOff: true },
  { title: 'EasyOrder: Pricing – Promotional Price Override', module: 'Pricing', description: 'Validate promo code overrides standard pricing.', steps: ['Apply promo code TWUATEST at cart', 'Confirm discounted unit price is reflected', 'Verify promo cannot be stacked with volume tier'], priority: TaskPriority.MEDIUM, status: TaskStatus.PASSED, signOff: true },
  { title: 'EasyOrder: Invoice Download', module: 'Invoicing', description: 'Verify invoice PDF is generated and downloadable after order fulfillment.', steps: ['Mark a submitted order as fulfilled', 'Navigate to invoice section', 'Download PDF and confirm all line items match order'], priority: TaskPriority.MEDIUM, status: TaskStatus.IN_PROGRESS },
  { title: 'EasyOrder: Invoice – Tax Line Accuracy', module: 'Invoicing', description: 'Confirm TW-specific tax (VAT 5%) is correctly computed on invoice.', steps: ['Create an order totaling NTD 10,000', 'Download invoice', 'Confirm VAT line = NTD 500 (5%)'], priority: TaskPriority.HIGH, status: TaskStatus.FAILED, jira: 'JIRA-2201' },
  { title: 'EasyOrder: Blocked Order – Credit Limit Exceeded', module: 'Ordering', description: 'Verify system blocks orders when distributor exceeds credit limit.', steps: ['Log in as distributor with credit at 95%', 'Attempt to place an order exceeding remaining credit', 'Confirm error message and order blocked state'], priority: TaskPriority.HIGH, status: TaskStatus.BLOCKED, jira: 'JIRA-2202' },

  // SalesHub scenarios
  { title: 'SalesHub: Campaign Creation – TW Market', module: 'Campaigns', description: 'Create and publish a TW-specific campaign.', steps: ['Navigate to Campaigns → New Campaign', 'Set target market = TW and set start/end date', 'Publish campaign and verify it appears in TW feed'], priority: TaskPriority.HIGH, status: TaskStatus.READY },
  { title: 'SalesHub: Campaign – Audience Segment Filter', module: 'Campaigns', description: 'Validate audience filter narrows campaign reach correctly.', steps: ['Create campaign with segment = "TW Top 20 Accounts"', 'Preview audience count', 'Confirm count matches account list'], priority: TaskPriority.MEDIUM, status: TaskStatus.IN_PROGRESS },
  { title: 'SalesHub: Lead Capture from Campaign', module: 'Leads', description: 'Verify leads generated from campaign appear in pipeline.', steps: ['Run an active campaign', 'Click "Track Leads" on the campaign card', 'Confirm new leads from TW are listed in the pipeline'], priority: TaskPriority.HIGH, status: TaskStatus.PASSED, signOff: true },
  { title: 'SalesHub: Lead – Duplicate Detection', module: 'Leads', description: 'Test that duplicate lead submission is caught.', steps: ['Submit a lead for an existing contact email', 'Verify "Duplicate Lead" warning appears', 'Confirm the lead is merged rather than duplicated'], priority: TaskPriority.MEDIUM, status: TaskStatus.IN_PROGRESS },
  { title: 'SalesHub: Reporting – Monthly Sales Summary', module: 'Reporting', description: 'Validate monthly sales report generates correct totals for TW.', steps: ['Go to Reporting → Monthly Summary', 'Select TW market and current month', 'Export to CSV and verify row totals'], priority: TaskPriority.MEDIUM, status: TaskStatus.READY },
  { title: 'SalesHub: Reporting – Export Formatting', module: 'Reporting', description: 'Check CSV/Excel export column headers and data types.', steps: ['Export any report to XLSX', 'Open in Excel and confirm headers match spec', 'Verify date columns are formatted as DD/MM/YYYY'], priority: TaskPriority.LOW, status: TaskStatus.DRAFT },

  // ServicePro scenarios
  { title: 'ServicePro: Case Creation – Hardware Fault', module: 'Cases', description: 'Log a hardware fault case and verify SLA assignment.', steps: ['Click New Case → Category: Hardware Fault', 'Set priority = Critical and submit', 'Verify SLA timer starts and agent is assigned'], priority: TaskPriority.HIGH, status: TaskStatus.IN_PROGRESS },
  { title: 'ServicePro: Case Escalation Flow', module: 'Cases', description: 'Test escalation from L1 to L2 support.', steps: ['Open an existing case and click Escalate', 'Assign to L2 queue', 'Verify L2 agent receives notification and case status updates'], priority: TaskPriority.HIGH, status: TaskStatus.READY },
  { title: 'ServicePro: Scheduling – Technician Dispatch', module: 'Scheduling', description: 'Validate technician scheduling for on-site visit.', steps: ['Create a field-visit case', 'Open Scheduling → Find Available Technician', 'Confirm calendar slot is booked and confirmation email sent'], priority: TaskPriority.MEDIUM, status: TaskStatus.PASSED, signOff: true, cr: 'CR-3301' },
  { title: 'ServicePro: Scheduling – Rescheduling Flow', module: 'Scheduling', description: 'Test rescheduling a confirmed on-site appointment.', steps: ['Open a booked appointment', 'Click Reschedule and pick a new date', 'Verify old slot is released and new confirmation is sent'], priority: TaskPriority.LOW, status: TaskStatus.READY },
  { title: 'ServicePro: Analytics – Case Volume Dashboard', module: 'Analytics', description: 'Check case volume dashboard shows correct data for TW.', steps: ['Open Analytics → Case Volume', 'Filter by TW and last 30 days', 'Verify chart matches case count in Cases list'], priority: TaskPriority.MEDIUM, status: TaskStatus.IN_PROGRESS },
  { title: 'ServicePro: Analytics – Resolution Time SLA Report', module: 'Analytics', description: 'Confirm SLA compliance % is accurate on the resolution time report.', steps: ['Go to Analytics → SLA Report', 'Set region = TW and date range = Q1 2025', 'Confirm SLA breached cases match known failures'], priority: TaskPriority.HIGH, status: TaskStatus.FAILED, jira: 'JIRA-2210' },
  { title: 'ServicePro: Analytics – Export to PDF', module: 'Analytics', description: 'Verify analytics reports export to a readable PDF.', steps: ['Open any analytics report', 'Click Export → PDF', 'Confirm the PDF renders charts and tables correctly'], priority: TaskPriority.LOW, status: TaskStatus.DEPLOYED, signOff: true },
];

const stepDetails = (descriptions: string[]) =>
  descriptions.map((desc, i) => ({
    order: i + 1,
    description: desc,
    expectedResult: `Step ${i + 1} completes without errors and the expected UI state is reached.`,
    testData: i === 0 ? 'TW UAT credentials' : `Step ${i + 1} test data`
  }));

async function main() {
  const twUser = await prisma.user.findUnique({ where: { email: TW_EMAIL } });
  if (!twUser) {
    console.error(`User ${TW_EMAIL} not found. Run the main seed first.`);
    process.exit(1);
  }

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) {
    console.error('No admin user found.');
    process.exit(1);
  }

  const products = await prisma.product.findMany({
    include: { targetSystems: true }
  });

  const productMap = Object.fromEntries(products.map((p) => [p.name.toLowerCase().replace(/\s/g, ''), p]));

  const slugMap: Record<string, string> = {
    Ordering: 'easyorder',
    Pricing: 'easyorder',
    Invoicing: 'easyorder',
    Campaigns: 'saleshub',
    Leads: 'saleshub',
    Reporting: 'saleshub',
    Cases: 'servicepro',
    Scheduling: 'servicepro',
    Analytics: 'servicepro'
  };

  const now = Date.now();
  let created = 0;

  for (let i = 0; i < taskTemplates.length; i++) {
    const tmpl = taskTemplates[i];
    const productSlug = slugMap[tmpl.module];
    const product = products.find((p) => p.slug === productSlug);
    if (!product) continue;

    const existing = await prisma.task.findFirst({
      where: { title: tmpl.title, countryCode: 'TW' }
    });
    if (existing) continue;

    const createdAt = new Date(now - (taskTemplates.length - i) * 86400000);
    const updatedAt = new Date(createdAt.getTime() + 3600000 * 2);
    const signedOffAt = tmpl.signOff ? new Date(updatedAt.getTime() + 3600000) : null;

    const targetSystem = product.targetSystems[i % product.targetSystems.length];

    const task = await prisma.task.create({
      data: {
        title: tmpl.title,
        description: tmpl.description,
        status: tmpl.status,
        priority: tmpl.priority,
        countryCode: 'TW',
        productId: product.id,
        module: tmpl.module,
        targetSystemId: targetSystem?.id ?? null,
        assigneeId: tmpl.status === TaskStatus.DRAFT ? null : twUser.id,
        dueDate: new Date(now + (i + 1) * 86400000),
        createdAt,
        updatedAt,
        updatedById: admin.id,
        signedOffAt,
        signedOffById: signedOffAt ? admin.id : null,
        jiraTicket: tmpl.jira ?? null,
        crNumber: tmpl.cr ?? null
      }
    });

    await prisma.taskStep.createMany({
      data: stepDetails(tmpl.steps).map((s) => ({ ...s, taskId: task.id }))
    });

    await prisma.activity.create({
      data: {
        type: ActivityType.TASK_ASSIGNED,
        taskId: task.id,
        actorId: admin.id,
        countryCode: 'TW',
        message: `Admin assigned "${task.title}" to ${TW_EMAIL}.`
      }
    });

    if (tmpl.status !== TaskStatus.DRAFT) {
      await prisma.comment.create({
        data: {
          taskId: task.id,
          authorId: admin.id,
          body: `Please complete ${tmpl.module} UAT for TW by end of sprint.`
        }
      });

      await prisma.comment.create({
        data: {
          taskId: task.id,
          authorId: twUser.id,
          body: tmpl.status === TaskStatus.PASSED
            ? 'All steps passed. Ready for sign-off.'
            : tmpl.status === TaskStatus.FAILED
              ? 'Encountered issues during testing. See steps for details.'
              : 'Acknowledged. Working on this.'
        }
      });
    }

    if (tmpl.status === TaskStatus.FAILED && tmpl.jira) {
      await prisma.activity.create({
        data: {
          type: ActivityType.STATUS_CHANGED,
          taskId: task.id,
          actorId: twUser.id,
          countryCode: 'TW',
          message: `Status changed to FAILED. Jira ticket ${tmpl.jira} raised.`
        }
      });
    }

    if (signedOffAt) {
      await prisma.activity.create({
        data: {
          type: ActivityType.SIGNED_OFF,
          taskId: task.id,
          actorId: admin.id,
          countryCode: 'TW',
          message: `Task signed off by admin.`
        }
      });
    }

    created++;
  }

  console.log(`Done — created ${created} new tasks for ${TW_EMAIL}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
