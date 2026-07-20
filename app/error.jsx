'use client';
// بدل الشاشة البيضاء: لو حصل أي خطأ مفاجئ بنعرض شاشة واضحة بزرار رجوع فوري
// البيانات كلها محفوظة — الخطأ في العرض بس
export default function ErrorPage({ error, reset }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', fontFamily: 'inherit' }}>
      <img src="/logo.jpg" alt="" style={{ width: 90, height: 90, objectFit: 'contain', marginBottom: 14 }} />
      <h2 style={{ marginBottom: 8 }}>⚠️ حصلت مشكلة مؤقتة في العرض</h2>
      <p style={{ color: '#667', marginBottom: 18, lineHeight: 1.9 }}>
        متقلقش — كل بياناتك وفواتيرك محفوظة زي ما هي.<br />
        اضغط الزرار وهترجع تكمل شغلك فوراً.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button
          onClick={() => reset()}
          style={{ background: '#e8630a', color: '#fff', border: 0, borderRadius: 8, padding: '12px 26px', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          🔄 رجوع للبرنامج
        </button>
        <button
          onClick={() => { window.location.href = '/pos'; }}
          style={{ background: '#1b3a5c', color: '#fff', border: 0, borderRadius: 8, padding: '12px 26px', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          🧾 فتح فاتورة البيع
        </button>
      </div>
      {error?.message && (
        <p style={{ marginTop: 22, fontSize: 11, color: '#99a', direction: 'ltr' }}>{String(error.message).slice(0, 160)}</p>
      )}
    </div>
  );
}
