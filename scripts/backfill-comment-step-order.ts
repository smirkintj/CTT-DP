import prisma from '../lib/prisma';

const STEP_MARKER_REGEX = /^\[\[STEP:(\d+)\]\]\s*/i;

async function main() {
  const comments = await prisma.comment.findMany({
    where: {
      stepOrder: null
    },
    select: {
      id: true,
      body: true
    }
  });

  let updatedCount = 0;

  for (const comment of comments) {
    const match = comment.body.match(STEP_MARKER_REGEX);
    if (!match) continue;

    const parsedOrder = Number(match[1]);
    if (!Number.isInteger(parsedOrder) || parsedOrder <= 0) continue;

    const cleanedBody = comment.body.replace(STEP_MARKER_REGEX, '').trim();

    await prisma.comment.update({
      where: { id: comment.id },
      data: {
        stepOrder: parsedOrder,
        body: cleanedBody
      }
    });

    updatedCount += 1;
  }

  console.log(`Backfill complete. Updated ${updatedCount} comments.`);
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
