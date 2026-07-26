// صفحة الاستعلام ليها مانيفست خاص بيها — عشان تتثبّت على موبايل المندوب
// كتطبيق مستقل باسم "أسعار السقا" وأيقونة لوحده، وده كمان أساس الـ APK.
export const metadata = {
  title: 'أسعار السقا — المندوب',
  description: 'قائمة أسعار وصور أصناف شركة السقا للأدوات المنزلية',
  manifest: '/rep-manifest.json',
};

export default function InquiryLayout({ children }) {
  return children;
}
