// إعداد السحابة المدمج في الموقع — بيخلي رابط الفاتورة و QR يفتحوا مع أي عميل للأبد
// من غير أي إعداد على الأجهزة، ومن غير env vars في Vercel.
//
// الـ publishable/anon key آمن للنشر في الـ frontend (ده تصميم Supabase — الحماية بتيجي من RLS)،
// والريبو خاص أصلاً.
export const CLOUD_DEFAULT = {
  url: 'https://etgropsyjnggzdgoqorc.supabase.co',
  key: 'sb_publishable_JxOIGqCKMVUvhk5Xb8_fWQ_VbMTnbhw',
};

export function hasCloudDefault() {
  return !!(CLOUD_DEFAULT.url && CLOUD_DEFAULT.key);
}
