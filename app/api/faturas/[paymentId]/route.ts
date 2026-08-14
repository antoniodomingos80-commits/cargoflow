import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { obterDadosFatura } from '@/lib/faturas/actions';
import { formatCurrency } from '@/lib/utils';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  const { paymentId } = await params;
  const dados = await obterDadosFatura(paymentId);
  if (!dados) {
    return NextResponse.json({ error: 'Fatura não encontrada ou sem acesso.' }, { status: 404 });
  }

  const pdf = await PDFDocument.create();
  const pagina = pdf.addPage([595.28, 841.89]); // A4
  const fonteNormal = await pdf.embedFont(StandardFonts.Helvetica);
  const fonteNegrito = await pdf.embedFont(StandardFonts.HelveticaBold);

  const azul = rgb(0.055, 0.239, 0.373); // navy-600 aproximado
  const cinza = rgb(0.4, 0.44, 0.49);
  const margem = 50;
  let y = 780;

  function linha(
    texto: string,
    opcoes: { negrito?: boolean; tamanho?: number; cor?: ReturnType<typeof rgb>; x?: number } = {},
  ) {
    pagina.drawText(texto, {
      x: opcoes.x ?? margem,
      y,
      size: opcoes.tamanho ?? 11,
      font: opcoes.negrito ? fonteNegrito : fonteNormal,
      color: opcoes.cor ?? rgb(0.1, 0.1, 0.1),
    });
  }

  // Cabeçalho
  linha('CargoFlow', { negrito: true, tamanho: 22, cor: azul });
  y -= 18;
  linha('A logística inteligente começa aqui.', { tamanho: 9, cor: cinza });
  y -= 40;

  linha('FATURA', { negrito: true, tamanho: 16 });
  y -= 18;
  linha(`Nº ${dados.numero}`, { tamanho: 10, cor: cinza });
  y -= 14;
  linha(`Emitida em ${new Date(dados.emitidaEm).toLocaleDateString('pt-AO')}`, { tamanho: 10, cor: cinza });
  y -= 14;
  linha(
    dados.paga && dados.pagaEm
      ? `Paga em ${new Date(dados.pagaEm).toLocaleDateString('pt-AO')} · ${dados.provider}`
      : 'Estado: pendente',
    { tamanho: 10, cor: dados.paga ? rgb(0.1, 0.5, 0.25) : rgb(0.7, 0.45, 0.1) },
  );
  y -= 40;

  // Partes envolvidas
  linha('Comerciante', { negrito: true, tamanho: 11 });
  y -= 16;
  linha(dados.comerciante.nome, { tamanho: 10 });
  y -= 14;
  linha(`NIF: ${dados.comerciante.nif ?? 'não indicado'}`, { tamanho: 10, cor: cinza });
  y -= 30;

  linha('Transportador', { negrito: true, tamanho: 11 });
  y -= 16;
  linha(dados.transportador.nome, { tamanho: 10 });
  y -= 14;
  linha(`NIF: ${dados.transportador.nif ?? 'não indicado'}`, { tamanho: 10, cor: cinza });
  y -= 40;

  // Operação
  linha('Operação', { negrito: true, tamanho: 11 });
  y -= 16;
  linha(`${dados.operacao.referencia} · ${dados.operacao.titulo}`, { tamanho: 10 });
  y -= 14;
  linha(`${dados.operacao.origem} → ${dados.operacao.destino}`, { tamanho: 10, cor: cinza });
  y -= 50;

  // Total
  pagina.drawLine({
    start: { x: margem, y },
    end: { x: 545, y },
    thickness: 1,
    color: rgb(0.85, 0.87, 0.9),
  });
  y -= 30;
  linha('Total', { negrito: true, tamanho: 13 });
  linha(formatCurrency(dados.valor, dados.moeda), {
    negrito: true,
    tamanho: 16,
    x: 400,
    cor: azul,
  });

  y = 60;
  linha('Documento gerado automaticamente pela CargoFlow — sem validade fiscal formal enquanto', {
    tamanho: 8,
    cor: cinza,
  });
  y -= 11;
  linha('a integração com o regime de faturação em Angola não estiver concluída.', {
    tamanho: 8,
    cor: cinza,
  });

  const bytes = await pdf.save();

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${dados.numero}.pdf"`,
    },
  });
}
