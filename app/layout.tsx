import './globals.css';
import Providers from './Providers';

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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>
          {process.env.NEXT_PUBLIC_VERCEL_ENV !== "production" && (
            <div style={{
              backgroundColor: "#FEF3C7",
              color: "#92400E",
              padding: "8px",
              textAlign: "center",
              fontSize: "12px",
              fontWeight: "600"
            }}>
              ⚠️ STAGING / PREVIEW ENVIRONMENT
            </div>
          )}

          {children}
        </Providers>
      </body>
    </html>
  );
}
