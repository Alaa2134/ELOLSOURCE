import './globals.css';
import Shell from '@/components/Shell';
import DialogHost from '@/components/DialogHost';

export const metadata = {
  title: 'السقا للأدوات المنزلية — نظام الكاشير',
  description: 'برنامج كاشير ونقطة بيع متكامل لشركة السقا للأدوات المنزلية',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#f26a1b" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="icon" href="/icon-192.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* تحميل الخطوط في الخلفية — الصفحة بتظهر فوراً من غير انتظار */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var l=document.createElement('link');l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=Amiri:wght@400;700&display=swap';document.head.appendChild(l);})();",
          }}
        />
      </head>
      <body>
        <Shell>{children}</Shell>
        <DialogHost />
      </body>
    </html>
  );
}
