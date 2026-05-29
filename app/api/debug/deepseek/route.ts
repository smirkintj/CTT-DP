import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateDraftTask } from '@/lib/generateDraftTask';

// Temporary test endpoint — admin-only, tests DeepSeek connectivity
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'DEEPSEEK_API_KEY not set in environment' }, { status: 200 });
  }

  const mockRows = [
    {
      testCaseId: 'TC-001',
      title: 'User login with valid credentials',
      steps: [{ action: 'Navigate to login page and enter valid email and password', expected: 'User is redirected to dashboard' }],
      result: 'PASSED',
    },
    {
      testCaseId: 'TC-002',
      title: 'User login with invalid password',
      steps: [{ action: 'Enter valid email and wrong password', expected: 'Error message: Invalid credentials' }],
      result: 'PASSED',
    },
  ];

  const start = Date.now();
  try {
    const result = await generateDraftTask('TEST-001', 'User Authentication Flow', mockRows);
    return NextResponse.json({
      ok: true,
      latencyMs: Date.now() - start,
      keyPresent: true,
      result,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      latencyMs: Date.now() - start,
      error: String(err),
    }, { status: 200 });
  }
}
