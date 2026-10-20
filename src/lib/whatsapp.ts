import { formatCOP } from "./money";

/** Número colombiano a formato internacional para wa.me (57 + 10 dígitos). */
export function toWhatsAppNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("3")) return `57${digits}`;
  if (digits.length === 12 && digits.startsWith("57")) return digits;
  return null;
}

export function reminderMessage(customerName: string, balance: number, storeName: string): string {
  const firstName = customerName.split(" ")[0];
  return (
    `Hola ${firstName}, te saluda ${storeName}. ` +
    `Te recordamos que tienes un saldo pendiente de ${formatCOP(balance)}. ` +
    `Puedes pasar a abonar cuando quieras o pagar por Nequi. ¡Gracias por tu confianza!`
  );
}

export function whatsAppLink(phone: string, message: string): string | null {
  const number = toWhatsAppNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null;
}
