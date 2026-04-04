import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const run = async () => {
  const users = await prisma.user.findMany({
    select: { email: true, isActive: true, mustChangePassword: true }
  });
  console.log(JSON.stringify(users, null, 2));
};

run().finally(() => prisma.$disconnect());
