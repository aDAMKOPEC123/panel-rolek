export const TYPY_PUBLIKACJI = {
  rolka: { nazwa: "Rolka", ikona: "🎬" },
  post: { nazwa: "Post statyczny", ikona: "🖼️" },
  karuzela: { nazwa: "Karuzela", ikona: "▤" },
  story: { nazwa: "Animowane Story", ikona: "📱" },
};
export const CELE_PUBLIKACJI = {
  dowolny: "Dowolny cel",
  edukacyjny: "Edukacja",
  promocyjny: "Promocja",
  informacyjny: "Informacja",
  wizerunkowy: "Wizerunek",
};
export const DNI_PUBLIKACJI = ["pn", "wt", "sr", "cz", "pt", "so", "nd"];
export const typPublikacji = (d) => d?.typ_publikacji || "rolka";
export const czyRolka = (d) => typPublikacji(d) === "rolka";

export function wyborPublikacji(typ = "rolka", cel = "dowolny") {
  if (typeof typ !== "string" || !Object.hasOwn(TYPY_PUBLIKACJI, typ)) throw new Error("Wybierz prawidłowy format publikacji.");
  if (typeof cel !== "string" || !Object.hasOwn(CELE_PUBLIKACJI, cel)) throw new Error("Wybierz prawidłowy cel publikacji.");
  return { typ_publikacji: typ, cel_publikacji: cel };
}

export function rozkladPublikacji(publikacje) {
  if (!Array.isArray(publikacje) || publikacje.length < 1 || publikacje.length > 7) throw new Error("Wybierz format dla co najmniej jednego dnia.");
  const dni = new Map();
  for (const p of publikacje) {
    if (!DNI_PUBLIKACJI.includes(p?.dzien) || dni.has(p.dzien) || !p.typ_publikacji) throw new Error("Plan może mieć jeden format na każdy wybrany dzień.");
    dni.set(p.dzien, { dzien: p.dzien, ...wyborPublikacji(p.typ_publikacji, p.cel_publikacji) });
  }
  return DNI_PUBLIKACJI.filter((d) => dni.has(d)).map((d) => dni.get(d));
}
