import type { NotaNormalizada } from "./types";

/**
 * O mesmo número de nota pode aparecer em várias linhas (vários itens/serviços
 * da mesma NFS-e). Para conciliar, agrupamos por prestador + número da nota,
 * somando os valores. Assim uma nota conta como UMA nota só.
 */
export function agruparPorNota(notas: NotaNormalizada[]): NotaNormalizada[] {
  const map = new Map<string, NotaNormalizada & { _linhas: number }>();

  for (const n of notas) {
    const key = `${n.cnpjPrestador}|${n.numeroNota}`;
    if (!n.numeroNota) {
      // sem número não dá para agrupar com segurança
      map.set(`${key}|${map.size}`, { ...n, _linhas: 1 });
      continue;
    }
    const cur = map.get(key);
    if (!cur) {
      map.set(key, { ...n, _linhas: 1 });
      continue;
    }
    cur.valorNota += n.valorNota;
    cur.valorISS += n.valorISS;
    cur.issRetido += n.issRetido;
    cur.baseISS += n.baseISS;
    cur._linhas += 1;
    cur.raw = { ...cur.raw, linhasAgrupadas: cur._linhas };
  }

  return Array.from(map.values()).map(({ _linhas, ...rest }) => ({
    ...rest,
    raw: { ...rest.raw, linhasAgrupadas: _linhas },
  }));
}
