// SPDX-License-Identifier: AGPL-3.0-or-later
// Genera e2e/fixtures/ejemplo.pdf: un PDF propio de 2 páginas con texto ficticio (sin fuentes incrustadas ni datos reales).
// Uso: node e2e/fixtures/generar-ejemplo-pdf.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pagina = (n) =>
  [
    'BT /F1 28 Tf 72 700 Td (Documento ficticio de ejemplo) Tj ET',
    `BT /F1 18 Tf 72 660 Td (Pagina ${n} de 2) Tj ET`,
    '0.5 0.5 0.5 RG 72 600 468 1 re S',
    `BT /F1 12 Tf 72 570 Td (Este PDF se genero para las pruebas de IPN Folio. Contiene datos inventados.) Tj ET`,
  ].join('\n');

const objetos = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ...[1, 2].map((n) => {
    const flujo = pagina(n);
    return `<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`;
  }),
];

let salida = '%PDF-1.4\n';
const posiciones = [];
objetos.forEach((cuerpo, i) => {
  posiciones.push(salida.length);
  salida += `${i + 1} 0 obj\n${cuerpo}\nendobj\n`;
});
const inicioXref = salida.length;
salida += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
for (const p of posiciones) salida += `${String(p).padStart(10, '0')} 00000 n \n`;
salida += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;

writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'ejemplo.pdf'), salida, 'latin1');
