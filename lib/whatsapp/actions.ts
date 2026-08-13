// Sem 'use server' — este ficheiro não exporta Server Actions invocáveis
// diretamente por formulários, só uma função auxiliar chamada internamente
// por outras Server Actions (lib/matching/actions.ts).

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
// Número sandbox por defeito da Twilio — trocar via env var TWILIO_WHATSAPP_FROM
// quando/se migrarem para um número de WhatsApp Business aprovado.
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

/**
 * Envia uma mensagem de WhatsApp via Twilio.
 *
 * Nunca lança exceção — isto é sempre um extra sobre outra ação (publicar
 * carga/viagem), e um problema aqui (Twilio em baixo, número não registado
 * na sandbox, etc.) nunca deve impedir essa ação principal de completar.
 */
export async function enviarWhatsApp(telefone: string | null | undefined, mensagem: string): Promise<void> {
  if (!telefone) return;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.warn('Twilio não configurado (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN em falta) — a saltar WhatsApp.');
    return;
  }

  try {
    // Twilio exige formato E.164 (+244923456789). Aceitamos números já
    // guardados com ou sem o "+" e normalizamos aqui.
    const digitos = telefone.replace(/[^\d]/g, '');
    if (digitos.length < 9) return;
    const numeroDestino = telefone.trim().startsWith('+') ? telefone.trim() : `+${digitos}`;

    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const corpo = new URLSearchParams({
      From: TWILIO_WHATSAPP_FROM,
      To: `whatsapp:${numeroDestino}`,
      Body: mensagem,
    });

    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

    const resposta = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: corpo.toString(),
    });

    if (!resposta.ok) {
      const texto = await resposta.text();
      console.error('Erro ao enviar WhatsApp:', resposta.status, texto);
    }
  } catch (erro) {
    console.error('Erro ao enviar WhatsApp:', erro);
  }
}
