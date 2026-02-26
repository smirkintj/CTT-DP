import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createAdminAudit } from '@/lib/adminAudit';

export async function POST() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!process.env.EMAIL_FROM || !process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Email config is not configured' }, { status: 500 });
  }

  const to = session.user.email;
  if (!to) {
    return NextResponse.json({ error: 'Current user email is missing' }, { status: 400 });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [to],
        subject: 'CTT UAT Portal - Test Notification',
        html: `
          <div style="font-family: Inter, Arial, sans-serif; color: #0f172a;">
            <h2>Test Notification Successful</h2>
            <p>This confirms that email notifications from the CTT UAT Portal are working correctly.</p>
            <p><strong>User:</strong> ${session.user.name || session.user.email}</p>
            <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
          </div>
        `
      })
    });

    if (!response.ok) {
      const raw = await response.text();
      let resendError = raw;
      try {
        const parsed = JSON.parse(raw);
        resendError = parsed?.message || parsed?.error || raw;
      } catch {}
      console.error('Resend send failed:', response.status, resendError);
      await createAdminAudit({
        actorId: session.user.id,
        message: 'Admin test notification failed.',
        metadata: {
          action: 'TEST_NOTIFICATION_FAILED',
          status: response.status,
          to
        }
      });
      return NextResponse.json(
        {
          error: `Resend error ${response.status}: ${resendError}`
        },
        { status: 500 }
      );
    }

    console.log('Test notification sent by ADMIN', session.user.email);
    await createAdminAudit({
      actorId: session.user.id,
      message: 'Admin sent test notification email.',
      metadata: { action: 'TEST_NOTIFICATION_SENT', to }
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Test notification error:', err);
    await createAdminAudit({
      actorId: session.user.id,
      message: 'Admin test notification failed.',
      metadata: { action: 'TEST_NOTIFICATION_FAILED', reason: err instanceof Error ? err.message : 'unknown' }
    });
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Failed to send email'
      },
      { status: 500 }
    );
  }
}
