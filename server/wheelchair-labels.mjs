const presentation = {
  '18.50.02.2128': ['Lexis light', 'Trendmobil', 'szerokość siedziska + 2,2 cm', 'Źródła podają różne wymiary: katalog dodaje do szerokości siedziska 2,2 cm, a producent 22 cm. Zmierz swój wózek.'],
  '18.46.06.0014': ['Quickie Q50 R', 'Sunrise Medical', '60 cm', 'Producent potwierdza 60 cm dla modelu Q50 R. Ten wymiar nie dotyczy Q50 R Carbon. Sprawdź wersję i osprzęt swojego wózka.'],
  '18.50.03.0211': ['Sopur Xenon²', 'Sunrise Medical', '57–75 cm, zależnie od siedziska', 'Szerokość zależy od wersji, siedziska i ustawienia kół. Nowsza dokumentacja nie potwierdza dokładnego wariantu z katalogu.'],
  '18.50.03.0224': ['Avantgarde 4 DV', 'Ottobock', '49–72,5 cm', 'Producent potwierdza ten zakres. Szerokość konkretnego wózka zależy od siedziska i pochylenia kół.'],
  '18.50.03.0257': ['Motus 2 CV', 'Ottobock', '50,5–68 cm', 'Producent potwierdza ten zakres szerokości całkowitej. Zmierz własny egzemplarz wraz z osprzętem.'],
  '18.50.03.5025': ['Ventus', 'Ottobock', '45–85 cm', 'Producent potwierdza ten zakres. Szerokość zależy od siedziska i pochylenia kół.'],
  '18.50.03.0160': ['Eurochair Avanti 1.736', 'MEYRA', 'szerokość siedziska + 18 cm', 'Ta zależność pasuje tylko do jednego rodzaju osłon bocznych. Katalog nie określa konfiguracji, dlatego potrzebny jest pomiar Twojego wózka.'],
  '18.99.06.1158': ['M3 Corpus z podnośnikiem (wariant PPP)', 'Permobil', '65–79 cm', 'Dokumentacja podaje taki zakres dla rodziny M3 Corpus, ale nie potwierdza dokładnego wariantu z katalogu.'],
  '18.50.04.0193': ['Quickie Q200 R', 'Sunrise Medical', '58 cm w katalogu', '58 cm może oznaczać samą podstawę. Siedzisko z podłokietnikami może mieć do 66 cm. Dokumentacja dotyczy innej konfiguracji, więc zmierz swój wózek.'],
  '18.50.04.0194': ['Quickie Q500 M', 'Sunrise Medical', '62 cm w katalogu', 'Źródła opisują różne rozmiary kół. Nie potwierdzają jednej szerokości dla wszystkich konfiguracji.'],
  '18.50.04.0192': ['Quickie Q700 M bez podnośnika', 'Sunrise Medical', '62,2–66 cm', 'Nowsza instrukcja podaje ten zakres, ale nie potwierdza dokładnej starszej wersji bez podnośnika.'],
  '18.50.04.0217': ['Quickie Q300 M Mini', 'Sunrise Medical', '61–62 cm w katalogu', 'Źródła są sprzeczne: dla tych samych kół producent podaje 54 cm, a katalog 61–62 cm. Nie stosujemy żadnej wartości bez sprawdzenia Twojej konfiguracji.'],
  '18.50.03.1089': ['Avantgarde 4 DV Teen', 'Ottobock', '49–72,5 cm w katalogu', 'Instrukcja całej rodziny wózków podaje ten zakres, ale nie przypisuje go jednoznacznie do wersji Teen.'],
};

export function wheelchairPresentation(record) {
  const value = presentation[record.gkv_id];
  if (!value) return {};
  const [name, manufacturer, widthLabel, notes] = value;
  return { name, manufacturer, widthLabel, notes, catalogName: record.model,
    catalogWidthLabel: record.gkv_dimensions.overall_width[0]?.raw_expression,
    sourceNotes: record.manufacturer_verification?.reasoning };
}
