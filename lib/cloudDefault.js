// إعداد السحابة المدمج في الموقع — بيخلي رابط الفاتورة و QR يفتحوا مع أي عميل للأبد
// من غير أي إعداد على الأجهزة، ومن غير env vars في Vercel.
//
// الـ anon key آمن للنشر في الـ frontend (ده تصميم Supabase — الحماية بتيجي من RLS)،
// والريبو خاص أصلاً. لملء القيم: حطها هنا وانشر.
//
// ⬇️ حط قيمك هنا (من Supabase → Project Settings → API):
export const CLOUD_DEFAULT = {
  url: '',
  key: '',
};

export function hasCloudDefault() {
  return !!(CLOUD_DEFAULT.url && CLOUD_DEFAULT.key);
}
