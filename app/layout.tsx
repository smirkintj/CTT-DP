import './globals.css';
import Providers from './Providers';
import { SpeedInsights } from '@vercel/speed-insights/next';

export const metadata = {
  title: 'CTT - Cuba Try Test',
  description: 'Cuba Try Test - UAT Management',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {process.env.NEXT_PUBLIC_VERCEL_ENV !== "production" && (
            <div style={{
              backgroundColor: "#FEF3C7",
              color: "#92400E",
              padding: "6px 12px",
              textAlign: "center",
              fontSize: "12px",
              fontWeight: "600",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
            }}>
              <span>⚠️ STAGING / PREVIEW ENVIRONMENT</span>
              <span style={{ fontWeight: 400, opacity: 0.75, display: "flex", gap: "8px" }}>
                <span style={{
                  background: "#92400E",
                  color: "#FEF3C7",
                  borderRadius: "4px",
                  padding: "1px 6px",
                  fontFamily: "monospace",
                  fontSize: "11px",
                }}>
                  {process.env.NEXT_PUBLIC_GIT_BRANCH ?? "local"}
                </span>
                {process.env.NEXT_PUBLIC_COMMIT_SHA && process.env.NEXT_PUBLIC_COMMIT_SHA !== "local" ? (
                  <a
                    href={`https://github.com/smirkintj/CTT-DP/commit/${process.env.NEXT_PUBLIC_COMMIT_SHA}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: "#92400E",
                      color: "#FEF3C7",
                      borderRadius: "4px",
                      padding: "1px 6px",
                      fontFamily: "monospace",
                      fontSize: "11px",
                      textDecoration: "none",
                    }}
                  >
                    {process.env.NEXT_PUBLIC_COMMIT_SHA}
                  </a>
                ) : (
                  <span style={{
                    background: "#92400E",
                    color: "#FEF3C7",
                    borderRadius: "4px",
                    padding: "1px 6px",
                    fontFamily: "monospace",
                    fontSize: "11px",
                  }}>
                    local
                  </span>
                )}
              </span>
            </div>
          )}

          {children}
        </Providers>
        <SpeedInsights />
      </body>
    </html>
  );
}
