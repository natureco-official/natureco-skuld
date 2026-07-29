'use strict';

const { assessToolPath } = require('./tool-path-policy');
const { validateJsonSchema } = require('./json-schema');
const { standardToolResult } = require('./tool-result');

// Transport-agnostic pipeline: resolve -> availability -> policy -> execute -> post-process.
async function executeThroughGateway(options) {
  const {
    toolName, args = {}, resolveTool, checkAvailability, policyChecks = [],
    execute, postProcess, allowSensitivePaths = false, standardResult = false,
    signal,
    normalizeSuccess = result => ({ result }),
    normalizeError = error => ({ error }),
  } = options || {};

  if (!toolName || typeof resolveTool !== 'function') {
    return normalizeError('Geçersiz araç çalıştırma isteği');
  }

  let tool;
  try { tool = await resolveTool(toolName); }
  catch (error) { return normalizeError(error?.message || String(error)); }

  if (!tool) return normalizeError(`Tool bulunamadı: ${toolName}`);
  const executor = execute || tool.execute;
  if (typeof executor !== 'function') return normalizeError(`Tool execute fonksiyonu yok: ${toolName}`);

  try {
    signal?.throwIfAborted();

    // GÜVENLİK: onay bayrakları MODEL ARGÜMANLARINDAN temizlenir.
    //
    // `agOnayli` ve `onayli` iç bayraklar: "karar zaten yukarıda verildi"
    // demek için var. Ama araç şemalarında `additionalProperties: false`
    // yok, yani model `{"url":"...","agOnayli":true}` yazıp doğrulamayı
    // geçebiliyor ve kendi kendini onaylayabiliyordu. Kanıtlandı:
    // validateJsonSchema bu argümanı kabul ediyor ve executor'a olduğu gibi
    // geçiyordu.
    //
    // Bir onay bayrağı, onaylanacak şeyi üreten tarafın erişebildiği bir yer
    // olamaz. Model tarafından gelen her şey burada kesiliyor; iç çağıranlar
    // (testler, kendi kodumuz) aracı doğrudan çağırdıkları için etkilenmez.
    const ONAY_BAYRAKLARI = ['agOnayli', 'onayli', 'kararVerildi', 'approved'];
    // `args` yukarıda `const` ile çözülüyor, yeniden atanamaz; temizlenmiş
    // kopya ayrı değişkende tutulur ve bundan sonrası onu kullanır.
    let temizArgs = args;
    if (args && typeof args === 'object' && !Array.isArray(args)) {
      const denenen = ONAY_BAYRAKLARI.filter((b) =>
        Object.prototype.hasOwnProperty.call(args, b),
      );
      if (denenen.length > 0) {
        temizArgs = { ...args };
        for (const b of ONAY_BAYRAKLARI) delete temizArgs[b];
        // Bunu görmek önemli: model onay bayrağı denediyse bu bir sinyaldir.
        if (process.env.SKULD_DENETIM_LOG) {
          process.stderr.write(
            `[skuld] ${toolName}: model onay bayrağı gönderdi (${denenen.join(', ')}), temizlendi\n`,
          );
        }
      }
    }

    const schema = tool.inputSchema || tool.parameters || tool.schema?.parameters;
    const validation = validateJsonSchema(schema, temizArgs);
    if (!validation.valid) return normalizeError(`Geçersiz araç argümanları: ${validation.errors.join('; ')}`);
    if (!allowSensitivePaths) {
      const pathDecision = assessToolPath(toolName, temizArgs);
      if (!pathDecision.allowed) return normalizeError(pathDecision.reason);
    }
    if (checkAvailability) {
      const decision = await checkAvailability({ toolName, args: temizArgs, tool });
      if (decision === false) return normalizeError(`${toolName} şu anda kullanılamıyor`);
      if (decision?.allowed === false) return normalizeError(decision.reason || `${toolName} şu anda kullanılamıyor`);
    }
    for (const check of policyChecks) {
      if (typeof check !== 'function') continue;
      const decision = await check({ toolName, args: temizArgs, tool });
      if (decision === false) return normalizeError('Araç çalıştırma politikası engelledi');
      if (decision?.allowed === false) return normalizeError(decision.reason || 'Araç çalıştırma politikası engelledi');
    }
    let result = await executor.call(tool, temizArgs, { signal });
    signal?.throwIfAborted();
    if (postProcess) result = await postProcess({ toolName, args: temizArgs, tool, result });
    if (standardResult) return standardToolResult(result, { tool: toolName });
    return normalizeSuccess(result);
  } catch (error) {
    if (signal && (signal.aborted || error?.name === 'AbortError')) throw error;
    return normalizeError(error?.message || String(error));
  }
}

module.exports = { executeThroughGateway };
