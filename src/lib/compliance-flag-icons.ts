export function flagIcon(id: string): string {
  if (id.includes("fredet")) return "🏛️";
  if (id.includes("strandbeskyttelse")) return "🌊";
  if (id.includes("fredskov")) return "🌲";
  if (id.includes("skovbyggelinje")) return "🌳";
  if (id.includes("soebeskyttelse")) return "💧";
  return "⚠️";
}
