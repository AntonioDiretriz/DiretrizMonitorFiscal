const fav = (domain: string) =>
  `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

const BANK_MAP: [RegExp, string][] = [
  [/ita[uú]/i,                       fav("itau.com.br")],
  [/bradesco/i,                       fav("bradesco.com.br")],
  [/santander/i,                      fav("santander.com.br")],
  [/banco\s*do\s*brasil|^bb$/i,       fav("bb.com.br")],
  [/caixa/i,                          fav("caixa.gov.br")],
  [/nubank/i,                         fav("nubank.com.br")],
  [/banco\s*inter|^inter$/i,          fav("bancointer.com.br")],
  [/bnb|banco\s*do\s*nordeste/i,      fav("bnb.gov.br")],
  [/btg/i,                            fav("btgpactual.com")],
  [/c6\s*bank|^c6$/i,                 fav("c6bank.com.br")],
  [/sicredi/i,                        fav("sicredi.com.br")],
  [/sicoob/i,                         fav("sicoob.com.br")],
  [/original/i,                       fav("original.com.br")],
  [/safra/i,                          fav("safra.com.br")],
  [/xp\s*invest|^xp$/i,              fav("xpi.com.br")],
  [/stone/i,                          fav("stone.com.br")],
  [/pagbank|pagseguro/i,              fav("pagbank.com.br")],
  [/mercado\s*pago/i,                 fav("mercadopago.com.br")],
  [/neon/i,                           fav("neon.com.br")],
  [/modal/i,                          fav("modal.com.br")],
  [/pan/i,                            fav("bancopan.com.br")],
  [/ailos/i,                          fav("ailos.coop.br")],
  [/uni[ck]red/i,                     fav("unicred.com.br")],
  [/daycoval/i,                       fav("daycoval.com.br")],
  [/bs2/i,                            fav("bs2.com.br")],
  [/votorantim/i,                     fav("votorantimbanco.com.br")],
  [/banrisul/i,                       fav("banrisul.com.br")],
  [/will\s*bank|willbank/i,           fav("willbank.com.br")],
  [/agi\s*bank|agibank/i,             fav("agibank.com.br")],
];

export function getBankLogo(banco: string): string | null {
  for (const [re, url] of BANK_MAP) {
    if (re.test(banco)) return url;
  }
  return null;
}
