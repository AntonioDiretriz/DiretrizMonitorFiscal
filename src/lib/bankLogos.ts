const BANK_MAP: [RegExp, string][] = [
  [/ita[uú]/i,                       "https://logo.clearbit.com/itau.com.br"],
  [/bradesco/i,                       "https://logo.clearbit.com/bradesco.com.br"],
  [/santander/i,                      "https://logo.clearbit.com/santander.com.br"],
  [/banco\s*do\s*brasil|^bb$/i,       "https://logo.clearbit.com/bb.com.br"],
  [/caixa/i,                          "https://logo.clearbit.com/caixa.gov.br"],
  [/nubank/i,                         "https://logo.clearbit.com/nubank.com.br"],
  [/banco\s*inter|^inter$/i,          "https://logo.clearbit.com/bancointer.com.br"],
  [/btg/i,                            "https://logo.clearbit.com/btgpactual.com"],
  [/c6\s*bank|^c6$/i,                 "https://logo.clearbit.com/c6bank.com.br"],
  [/sicredi/i,                        "https://logo.clearbit.com/sicredi.com.br"],
  [/sicoob/i,                         "https://logo.clearbit.com/sicoob.com.br"],
  [/original/i,                       "https://logo.clearbit.com/original.com.br"],
  [/safra/i,                          "https://logo.clearbit.com/safra.com.br"],
  [/xp\s*invest|^xp$/i,              "https://logo.clearbit.com/xpi.com.br"],
  [/stone/i,                          "https://logo.clearbit.com/stone.com.br"],
  [/pagbank|pagseguro/i,              "https://logo.clearbit.com/pagbank.com.br"],
  [/mercado\s*pago/i,                 "https://logo.clearbit.com/mercadopago.com.br"],
  [/neon/i,                           "https://logo.clearbit.com/neon.com.br"],
  [/modal/i,                          "https://logo.clearbit.com/modal.com.br"],
  [/pan/i,                            "https://logo.clearbit.com/bancopan.com.br"],
  [/ailos/i,                          "https://logo.clearbit.com/ailos.coop.br"],
  [/uni[ck]red/i,                     "https://logo.clearbit.com/unicred.com.br"],
  [/daycoval/i,                       "https://logo.clearbit.com/daycoval.com.br"],
  [/ubs\s*bb|bs2/i,                   "https://logo.clearbit.com/bs2.com.br"],
  [/votorantim/i,                     "https://logo.clearbit.com/votorantimbanco.com.br"],
  [/banrisul/i,                       "https://logo.clearbit.com/banrisul.com.br"],
  [/will\s*bank|willbank/i,           "https://logo.clearbit.com/willbank.com.br"],
  [/agi\s*bank|agibank/i,             "https://logo.clearbit.com/agibank.com.br"],
];

export function getBankLogo(banco: string): string | null {
  for (const [re, url] of BANK_MAP) {
    if (re.test(banco)) return url;
  }
  return null;
}
