-- DropForeignKey
ALTER TABLE "TaskStep" DROP CONSTRAINT "TaskStep_taskId_fkey";

-- AddForeignKey
ALTER TABLE "TaskStep" ADD CONSTRAINT "TaskStep_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
