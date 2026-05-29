import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Find first active product
  const product = await prisma.product.findFirst({
    where: { isActive: true },
    select: { id: true, name: true }
  });

  if (!product) { console.log('No active product found'); return; }
  console.log('Product:', product.name, product.id);

  // Clean up any existing test draft
  await prisma.draftTask.deleteMany({ where: { jiraTicket: 'EO-TEST-001' } });

  const rawExcelData = [
    { testCaseId: 'TC-001', title: 'Bulk Order Upload — valid CSV', steps: [{ action: 'Upload a valid CSV file with 10 orders', expected: 'Orders appear in the order list within 30 seconds' }], result: 'PASSED' },
    { testCaseId: 'TC-002', title: 'Bulk Order Upload — invalid format', steps: [{ action: 'Upload a malformed CSV with missing columns', expected: 'Error message shown: "Invalid file format"' }], result: 'PASSED' },
    { testCaseId: 'TC-003', title: 'Order status sync', steps: [{ action: 'Submit an order and wait 1 minute', expected: 'Status updates from PENDING to CONFIRMED' }], result: 'PASSED' },
    { testCaseId: 'TC-004', title: 'Order cancellation flow', steps: [{ action: 'Cancel an order within 5 minutes of submission', expected: 'Order status changes to CANCELLED, confirmation email sent' }], result: 'PASSED' },
    { testCaseId: 'TC-005', title: 'Partial shipment tracking', steps: [{ action: 'View an order with 2 partial shipments', expected: 'Both shipment tracking numbers visible, quantities correct' }], result: 'PASSED' },
  ];

  const generatedData = {
    title: 'UAT: Bulk Order Upload & Order Management — EasyOrder MY',
    description: 'Verify that the bulk order upload feature and order management workflows function correctly in the UAT environment. Business users should confirm that CSV uploads process successfully, order statuses sync in real-time, and cancellation flows work as expected.',
    module: 'Bulk Order Upload',
    priority: 'HIGH',
    steps: [
      { description: 'Log in to EasyOrder and navigate to Bulk Order Upload', expectedResult: 'Upload page loads with a CSV template download option' },
      { description: 'Download the CSV template, fill in 5 test orders, and upload the file', expectedResult: 'All 5 orders appear in your order list within 30 seconds with status PENDING' },
      { description: 'Attempt to upload a CSV with a missing "Product Code" column', expectedResult: 'Error message displayed: "Invalid file format — required columns missing"' },
      { description: 'Wait 1-2 minutes after a successful upload', expectedResult: 'Order statuses update from PENDING to CONFIRMED automatically' },
      { description: 'Cancel one of the uploaded orders within 5 minutes of submission', expectedResult: 'Order status changes to CANCELLED and you receive a confirmation email' },
      { description: 'Click on an order that has been partially shipped', expectedResult: 'Both tracking numbers are visible with correct quantities for each shipment' },
    ],
  };

  const draft = await prisma.draftTask.create({
    data: {
      jiraTicket: 'EO-TEST-001',
      productId: product.id,
      status: 'PENDING',
      rawExcelData: rawExcelData as object[],
      generatedData: generatedData as object,
      resultTaskIds: [],
    }
  });

  console.log('Created DraftTask:', draft.id);
  console.log('Status:', draft.status);
  console.log('Go to /admin/draft-tasks to review');
}

main().catch(console.error).finally(() => prisma.$disconnect());
