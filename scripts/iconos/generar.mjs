// SPDX-License-Identifier: AGPL-3.0-or-later
// Genera los íconos del manifiesto (192, 512, maskable y apple-touch) a partir del logo c2 de Folio
// (scripts/iconos/folio-c2.svg, diseño del dueño para este producto). Dependencia de desarrollo: sharp (Apache-2.0).
// El borde claro para el modo oscuro está pendiente: el SVG se usa tal cual. Uso: npm run iconos
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DESTINO = resolve(AQUI, '..', '..', 'public', 'iconos');
const svg = readFileSync(join(AQUI, 'folio-c2.svg'));
// Fondo de los íconos «maskable» y apple-touch: el logo es guinda sobre transparente, así que va sobre blanco.
const FONDO = { r: 255, g: 255, b: 255, alpha: 1 };

async function logo(lado) {
  return sharp(svg, { density: 384 })
    .resize(lado, lado, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

/** Logo centrado en un lienzo del color de fondo; `relleno` es la fracción del lienzo que ocupa (zona segura). */
async function sobreFondo(lado, relleno) {
  const interior = Math.round(lado * relleno);
  const margen = Math.round((lado - interior) / 2);
  return sharp({ create: { width: lado, height: lado, channels: 4, background: FONDO } })
    .composite([{ input: await logo(interior), left: margen, top: margen }])
    .png()
    .toBuffer();
}

const salidas = {
  'icono-192.png': await logo(192),
  'icono-512.png': await logo(512),
  // «maskable»: el sistema recorta hasta un 20 % por lado; el logo ocupa el 62 % central.
  'icono-maskable-512.png': await sobreFondo(512, 0.62),
  'apple-touch-icon.png': await sobreFondo(180, 0.8),
};
for (const [nombre, datos] of Object.entries(salidas)) writeFileSync(join(DESTINO, nombre), datos);
console.log(`iconos: ${Object.keys(salidas).join(', ')} en public/iconos/`);
