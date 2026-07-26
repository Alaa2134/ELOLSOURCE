# تطبيق المندوب — أسعار السقا (Android)

تطبيق أندرويد بسيط بيفتح صفحة استعلام الأسعار (`/inquiry`) كتطبيق مستقل
بأيقونته الخاصة، من غير شريط عنوان المتصفح. مبني كـ **Trusted Web Activity**،
يعني بيعرض نفس صفحة الويب — فأي تعديل في الأسعار بيظهر في التطبيق على طول
من غير ما تنزّل نسخة جديدة.

- **اسم الحزمة:** `eg.alsaka.rep`
- **الرابط اللي بيفتحه:** `https://alsaka.vercel.app/inquiry`
- **أقل أندرويد:** 5.0 (API 21)

## التحقق من الملكية

عشان التطبيق يفتح من غير شريط العنوان، لازم الملف ده يفضل منشور على الموقع:

```
https://alsaka.vercel.app/.well-known/assetlinks.json
```

وهو موجود في `public/.well-known/assetlinks.json` وفيه بصمة مفتاح التوقيع.
**لو اتبنى التطبيق بمفتاح توقيع تاني، لازم البصمة في الملف ده تتغيّر** —
وإلا هيفتح وفوقه شريط عنوان المتصفح.

## بناء نسخة جديدة

محتاج: JDK 17+، Gradle 8.x، وAndroid SDK فيه `platforms;android-34`
و`build-tools;34.0.0`.

```bash
export ANDROID_HOME=/path/to/android-sdk
export ALSAKA_KEYSTORE=/path/to/alsaka-rep.keystore   # مش في المستودع
export ALSAKA_STOREPASS=...
export ALSAKA_KEYPASS=...

cd android
gradle assembleRelease
# الناتج: app/build/outputs/apk/release/app-release.apk
```

قبل ما تبني نسخة جديدة، زوّد `versionCode` و`versionName` في `app/build.gradle`،
وإلا الموبايل هيرفض يحدّث النسخة القديمة.

## ⚠️ مفتاح التوقيع

ملف `alsaka-rep.keystore` **مش في المستودع** عن قصد — أي حد معاه يقدر يوقّع
تحديثات باسم التطبيق. خليه في مكان أمان (نسخة على فلاشة + نسخة تانية).
لو ضاع، مش هتقدر تطلّع تحديث للتطبيق المثبّت — هتضطر تبني تطبيق جديد
باسم حزمة جديد، والمندوبين يمسحوا القديم ويثبّتوا الجديد.
