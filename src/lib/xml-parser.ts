import type { XmlNfeData } from './xml-confront-types';

function getText(parent: Element | null, tag: string): string {
  if (!parent) return '';
  const el = parent.getElementsByTagName(tag)[0];
  return el?.textContent?.trim() ?? '';
}

function getNumber(parent: Element | null, tag: string): number {
  const val = parseFloat(getText(parent, tag));
  return isNaN(val) ? 0 : val;
}

function isXmlCancelada(doc: Document): boolean {
  // Check protNFe > infProt > cStat === '101'
  const infProts = doc.getElementsByTagName('infProt');
  for (let i = 0; i < infProts.length; i++) {
    if (getText(infProts[i], 'cStat') === '101') return true;
  }
  // Check procEventoNFe / infEvento with tpEvento 110111 and cStat 135/155
  const infEventos = doc.getElementsByTagName('infEvento');
  for (let i = 0; i < infEventos.length; i++) {
    const tpEvento = getText(infEventos[i], 'tpEvento');
    const cStat = getText(infEventos[i], 'cStat');
    if (tpEvento === '110111' && (cStat === '135' || cStat === '155')) return true;
  }
  return false;
}

export function parseXmlNfe(xmlString: string): XmlNfeData | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');

    // Try to get chNFe from protNFe > infProt > chNFe
    let chNFe = getText(doc.documentElement, 'chNFe');

    // Fallback: get from infNFe Id attribute
    if (!chNFe || chNFe.length !== 44) {
      const infNFe = doc.getElementsByTagName('infNFe')[0];
      if (infNFe) {
        const id = infNFe.getAttribute('Id') ?? '';
        chNFe = id.replace(/^NFe/, '');
      }
    }

    const ide = doc.getElementsByTagName('ide')[0];
    const emit = doc.getElementsByTagName('emit')[0];
    const icmsTot = doc.getElementsByTagName('ICMSTot')[0];

    const nNF = getText(ide, 'nNF');
    const serie = getText(ide, 'serie');
    const dhEmi = getText(ide, 'dhEmi') || getText(ide, 'dEmi');
    const cnpjEmitente = getText(emit, 'CNPJ');
    const xNome = getText(emit, 'xNome');

    return {
      chNFe,
      nNF,
      serie,
      dhEmi,
      cnpjEmitente,
      xNome,
      vNF: getNumber(icmsTot, 'vNF'),
      vBC: getNumber(icmsTot, 'vBC'),
      vICMS: getNumber(icmsTot, 'vICMS'),
      vBCST: getNumber(icmsTot, 'vBCST'),
      vST: getNumber(icmsTot, 'vST'),
      vIPI: getNumber(icmsTot, 'vIPI'),
      vPIS: getNumber(icmsTot, 'vPIS'),
      vCOFINS: getNumber(icmsTot, 'vCOFINS'),
      vProd: getNumber(icmsTot, 'vProd'),
      cancelada: isXmlCancelada(doc),
    };
  } catch {
    return null;
  }
}

export async function parseXmlFiles(files: File[]): Promise<XmlNfeData[]> {
  const results: XmlNfeData[] = [];
  for (const file of files) {
    const text = await file.text();
    const parsed = parseXmlNfe(text);
    if (parsed && parsed.nNF) {
      results.push(parsed);
    }
  }
  return results;
}
