// Envoltorio del worker de BusyTeX para la prueba de IPN Folio.
// BusyTeX solo ejecuta `makeindex <principal>.idx`; la nomenclatura del paquete nomencl
// necesita además `makeindex <principal>.nlo -s nomencl.ist -o <principal>.nls`.
// Aquí se agrega ese paso después de cada pasada de TeX, como haría latexmk.

importScripts('busytex_worker_original.js');

const ejecutarOriginal = BusytexPipeline.prototype._run_cmd;

BusytexPipeline.prototype._run_cmd = function (Module, FS, cmd, ...resto) {
  const resultado = ejecutarOriginal.call(this, Module, FS, cmd, ...resto);
  const esTeX = /latex$/.test(cmd[0]);
  const principal = cmd.find((arg) => arg.endsWith('.tex'));
  if (esTeX && principal) {
    const nlo = principal.replace(/\.tex$/, '.nlo');
    if (FS.analyzePath(nlo).exists) {
      const nls = principal.replace(/\.tex$/, '.nls');
      ejecutarOriginal.call(this, Module, FS, ['makeindex', nlo, '-s', 'nomencl.ist', '-o', nls], ...resto);
    }
  }
  return resultado;
};
