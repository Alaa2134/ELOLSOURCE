'use client';
// آخر خط دفاع: لو الخطأ ضرب البرنامج كله — صفحة استرداد كاملة بدل الشاشة البيضاء
export default function GlobalError({ reset }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: 'Tahoma, Arial, sans-serif', background: '#f4f6f9' }}>
        <div style={{ padding: 50, textAlign: 'center' }}>
          <h2 style={{ marginBottom: 10 }}>⚠️ البرنامج محتاج يعيد التشغيل</h2>
          <p style={{ color: '#667', marginBottom: 20, lineHeight: 1.9 }}>
            كل بياناتك محفوظة ومفيش أي حاجة ضاعت.<br />اضغط الزرار وهيرجع شغال فوراً.
          </p>
          <button
            onClick={() => { try { reset(); } catch {} window.location.reload(); }}
            style={{ background: '#e8630a', color: '#fff', border: 0, borderRadius: 8, padding: '14px 30px', fontSize: 17, fontWeight: 700, cursor: 'pointer' }}
          >
            🔄 إعادة تشغيل البرنامج
          </button>
        </div>
      </body>
    </html>
  );
}
