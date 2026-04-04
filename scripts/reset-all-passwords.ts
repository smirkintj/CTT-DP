import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const run = async () => {
  const hash = await bcrypt.hash('Peter123@', 10);
  const result = await prisma.user.updateMany({
    data: { passwordHash: hash, mustChangePassword: false }
  });
  console.log(`Updated ${result.count} user(s).`);
};

run()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
