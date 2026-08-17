(() => {
  "use strict";
  const GENERIC = /ブランド|サイズ|商品名|希望小売|オープン価格|シリーズ|インチ|舗装路|高速走行|新車装着|ラジアル|タイヤ|ﾁｭｰﾌﾞ|チューブ|←|→|税込|価格表|メーカー|装着|説明書|必ず/i;
  const PRICE_FAMILY = /^(PSR|LVR|LSR)\w*/i;

  window.CatalogParser = Object.freeze({ parse, formatTireSize: buildTireSize, baseTireSize });

  async function parse(arrayBuffer) {
    if (!window.JSZip) throw new Error("JSZip is unavailable");
    const zip = await JSZip.loadAsync(arrayBuffer);
    const workbookXml = await readXml(zip, "xl/workbook.xml");
    const relsXml = await readXml(zip, "xl/_rels/workbook.xml.rels");
    const sharedStrings = await parseSharedStrings(zip);
    const relationMap = new Map([...relsXml.querySelectorAll("Relationship")].map(node => [
      node.getAttribute("Id"), normalizeWorkbookPath(node.getAttribute("Target"))
    ]));
    const sheets = [];
    for (const node of workbookXml.querySelectorAll("sheets > sheet")) {
      const relationId = node.getAttribute("r:id") || node.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
      const path = relationMap.get(relationId);
      if (!path || !zip.file(path)) continue;
      sheets.push({ name: node.getAttribute("name"), rows: parseRows(await readXml(zip, path), sharedStrings) });
    }
    const diagnostics = createDiagnostics(sheets);
    const normalized = extractNormalized(sheets, diagnostics);
    const winter = extractWinter(sheets, diagnostics);
    const summerVan = extractSummerVan(sheets, diagnostics);
    const products = winter.length
      ? [...normalized, ...winter, ...summerVan]
      : (normalized.length ? [...normalized, ...summerVan] : [...extractFallback(sheets, diagnostics), ...summerVan]);
    const uniqueProducts = deduplicate(products).map(withProductCategory);
    return {
      sheets: sheets.map(sheet => sheet.name),
      products: uniqueProducts,
      diagnostics: buildDiagnostics(sheets, products, uniqueProducts, diagnostics)
    };
  }

  async function parseSharedStrings(zip) {
    const file = zip.file("xl/sharedStrings.xml");
    if (!file) return [];
    const xml = parseXml(await file.async("string"));
    return [...xml.querySelectorAll("si")].map(node => [...node.querySelectorAll("t")].map(t => t.textContent).join(""));
  }

  function parseRows(xml, sharedStrings) {
    const rows = [];
    for (const rowNode of xml.querySelectorAll("sheetData > row")) {
      const rowNumber = Number(rowNode.getAttribute("r"));
      const cells = new Map();
      for (const cell of rowNode.querySelectorAll(":scope > c")) {
        const ref = cell.getAttribute("r");
        const type = cell.getAttribute("t");
        const valueNode = cell.querySelector(":scope > v");
        let value = "";
        if (type === "s" && valueNode) value = sharedStrings[Number(valueNode.textContent)] ?? "";
        else if (type === "inlineStr") value = cell.querySelector(":scope > is")?.textContent ?? "";
        else if (valueNode) {
          const raw = valueNode.textContent;
          value = type === "str" || type === "e" ? raw : (raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : raw);
        }
        cells.set(columnNumber(ref), { value, formula: cell.querySelector(":scope > f")?.textContent || "" });
      }
      rows[rowNumber] = cells;
    }
    return rows;
  }

  function extractNormalized(sheets, diagnostics) {
    const sourceMap = new Map(sheets.map(sheet => [sheet.name, sheet]));
    const products = [];
    for (const sheet of sheets) {
      const header = findHeader(sheet.rows);
      if (!header) continue;
      for (let r = header.row + 1; r < sheet.rows.length; r++) {
        const row = sheet.rows[r];
        if (!row) continue;
        const brand = canonical(getValue(row, header.columns.brand));
        const baseSize = text(getValue(row, header.columns.size));
        const code = text(getValue(row, header.columns.code));
        const costCell = row.get(header.columns.cost);
        const cost = price(costCell?.value);
        const source = text(getValue(row, header.columns.source)) || sheet.name;
        if (!brand || !looksLikeSize(baseSize) || !validPrice(cost)) {
          if (brand && !looksLikeSize(baseSize)) addIssue(diagnostics, sheet.name, r, "サイズ不明", { brand, code });
          if (brand && looksLikeSize(baseSize) && !validPrice(cost)) addIssue(diagnostics, sheet.name, r, "価格不明または不正", { brand, size: baseSize, code, value: text(costCell?.value) });
          continue;
        }
        const origin = parseOrigin(costCell?.formula, source);
        const sourceSheet = sourceMap.get(origin.sheet) || sourceMap.get(source);
        const sourceSpeed = sourceSheet ? getValue(sourceSheet.rows[origin.row], origin.column - 3) : "";
        const size = buildTireSize(
          baseSize,
          getValue(row, header.columns.loadIndex),
          getValue(row, header.columns.speedSymbol) || sourceSpeed
        );
        const subbrand = sourceSheet ? resolveProductBlock(sourceSheet.rows, origin.row, origin.column, brand) : "";
        products.push({ brand, subbrand: subbrand || "商品名記載なし", size, inch: extractInch(size), code, cost, source, sourceRow: r, sourceColumn: header.columns.cost, parser: "標準表" });
      }
    }
    return products;
  }

  function findHeader(rows) {
    const aliases = {
      source: ["元シート"],
      brand: ["ブランド"],
      size: ["タイヤサイズ", "サイズ"],
      loadIndex: ["ロードインデックス", "LI"],
      speedSymbol: ["速度記号", "スピードシンボル"],
      code: ["商品コード", "品番"],
      cost: ["仕入価格", "卸価格", "原価"]
    };
    for (let r = 1; r < Math.min(rows.length, 150); r++) {
      const row = rows[r];
      if (!row) continue;
      const columns = {};
      for (const [column, cell] of row) {
        const value = text(cell.value);
        for (const [key, names] of Object.entries(aliases)) if (names.some(name => value === name || value.includes(name))) columns[key] ??= column;
      }
      if (columns.brand && columns.size && columns.cost) return { row: r, columns };
    }
    return null;
  }

  function parseOrigin(formula, fallbackSheet) {
    const match = text(formula).match(/(?:'([^']+)'|([^!]+))!.*?([A-Z]+)(\d+)/i);
    if (!match) return { sheet: fallbackSheet, row: 0, column: 0 };
    return { sheet: match[1] || match[2], column: columnNumber(match[3]), row: Number(match[4]) };
  }

  function cleanProductName(value, brand) {
    const v = text(value).replace(/\s+/g, " ").trim();
    if (isProductNote(v)) return v;
    if (!v || canonicalExact(v).toUpperCase() === brand.toUpperCase() || GENERIC.test(v) || looksLikeSize(v)) return "";
    if (v === "001") return v;
    if (/^[\s　②★☆◇◆A-C()（）[\]{}]+$/.test(v) || /^[A-Z]?\d{3,5}$/.test(v) || PRICE_FAMILY.test(v)) return "";
    if (/^[\d.,\s]+$/.test(v) || /^[★☆◇◆※()（）[\]［］\s]*[A-ZＨＶＷＹＳＴ]+[★☆◇◆※()（）[\]［］\s]*$/.test(v)) return "";
    if (/^[ｱ-ﾝァ-ヶー]{1,3}$/.test(v) || v.length < 2) return "";
    return v;
  }

  function extractFallback(sheets, diagnostics) {
    const products = [];
    for (const sheet of sheets) {
      const lastSizes = new Map();
      const lastServices = new Map();
      for (let r = 1; r < sheet.rows.length; r++) {
        const row = sheet.rows[r];
        if (!row) continue;
        for (const [column, sizeCell] of row) {
          const size = text(sizeCell.value);
          if (looksLikeSize(size)) lastSizes.set(column, baseTireSize(size));
          const service = serviceValue(size);
          if (service) lastServices.set(column, service);
        }
        for (const [costCol, costCell] of row) {
          const cost = price(costCell.value);
          if (!validPrice(cost)) continue;
          const family = text(getValue(row, costCol - 2));
          const codeValue = getValue(row, costCol - 1);
          const codeNumber = price(codeValue);
          const familyLike = PRICE_FAMILY.test(family);
          const codeLike = Number.isFinite(codeNumber) && codeNumber >= 0 && codeNumber <= 99999;
          if (!familyLike && !codeLike) continue;
          // 商品コードセルを価格と誤認しない。コードの右隣に価格がある配置を優先する。
          const nextNumber = price(getValue(row, costCol + 1));
          if (familyLike && validPrice(nextNumber)) continue;
          const sizeCandidates = [...lastSizes.entries()].filter(([column]) => column < costCol);
          if (!sizeCandidates.length) continue;
          const [sizeColumn, baseSize] = sizeCandidates[sizeCandidates.length - 1];
          const service = nearbyServiceValue(row, sizeColumn) || lastServices.get(sizeColumn) || "";
          if (service) lastServices.set(sizeColumn, service);
          const size = buildTireSize(baseSize, service, getValue(row, costCol - 3));
          const brandInfo = findBrandSection(sheet.rows, r);
          const productColumn = resolveProductColumn(sheet.rows, brandInfo.row, r, costCol, brandForColumn(brandInfo.brands, costCol) || "");
          const brand = brandForColumn(brandInfo.brands, productColumn || costCol);
          if (!brand) continue;
          const subbrand = productNameForBlock(sheet.rows, brandInfo.row, r, productColumn || costCol - 2, brand);
          products.push({
            brand,
            subbrand: subbrand || "商品名記載なし",
            size,
            inch: extractInch(size),
            code: codeLike ? text(codeValue) : "",
            cost,
            source: sheet.name,
            sourceRow: r,
            sourceColumn: costCol,
            parser: "汎用表"
          });
        }
      }
    }
    return products;
  }

  function extractWinter(sheets, diagnostics) {
    const products = [];
    for (const sheet of sheets) {
      if (isIcePartnerSheet(sheet)) products.push(...extractIcePartnerSheet(sheet, diagnostics));
      else if (isPyrWinterSheet(sheet)) products.push(...extractPyrWinterSheet(sheet, diagnostics), ...extractPyrRftSheet(sheet, diagnostics));
      else if (isVanWinterSheet(sheet)) products.push(...extractVanWinterSheet(sheet, diagnostics));
    }
    return products;
  }

  function extractSummerVan(sheets, diagnostics) {
    return sheets.flatMap(sheet => isSummerVanSheet(sheet) ? extractSummerVanSheet(sheet, diagnostics) : []);
  }

  function isSummerVanSheet(sheet) {
    return /(^|[^A-Z])(?:LV|LRB|V)([^A-Z]|$)/i.test(text(sheet.name));
  }

  function extractSummerVanSheet(sheet, diagnostics) {
    const products = [];
    for (let r = 1; r < sheet.rows.length; r++) {
      const headerRow = sheet.rows[r];
      if (!headerRow || !rowIncludes(headerRow, /ｻｲｽﾞ|サイズ/) || !rowIncludes(headerRow, /PR\s*LI|LI\s*PR|ロードインデックス|LI/i)) continue;
      const sizeColumns = [...headerRow]
        .filter(([, cell]) => /ｻｲｽﾞ|サイズ/.test(text(cell.value)))
        .map(([column]) => column);
      for (const sizeColumn of sizeColumns) {
        const subbrand = summerVanProductName(sheet.rows, r, sizeColumn);
        if (!subbrand) continue;
        const brandInfo = findBrandSection(sheet.rows, r);
        const brand = brandForColumn(brandInfo.brands, sizeColumn) || nearestBrandAbove(sheet.rows, r, sizeColumn) || "BRIDGESTONE";
        for (let dataRowIndex = r + 1; dataRowIndex < Math.min(sheet.rows.length, r + 30); dataRowIndex++) {
          const row = sheet.rows[dataRowIndex];
          if (!row) continue;
          if (dataRowIndex > r + 1 && (rowIncludes(row, /ｻｲｽﾞ|サイズ/) || rowHasProductNameOnly(row))) break;
          const baseSize = baseTireSize(getValue(row, sizeColumn));
          if (!baseSize) continue;
          const li = getValue(row, sizeColumn + 1);
          const size = buildTireSize(baseSize, li, "");
          const costEntry = rightmostValidPrice(row, sizeColumn + 1);
          if (!costEntry) {
            addIssue(diagnostics, sheet.name, dataRowIndex, "価格不明または不正", { product: subbrand, brand, size, value: rowValues(row).join(" / ") });
            continue;
          }
          products.push({
            brand,
            subbrand,
            size,
            inch: extractInch(size),
            code: "",
            cost: costEntry.cost,
            source: sheet.name,
            sourceRow: dataRowIndex,
            sourceColumn: costEntry.column,
            parser: "夏LV"
          });
        }
      }
    }
    return products;
  }

  function isPyrWinterSheet(sheet) {
    return /^PYR/i.test(text(sheet.name)) || sheetHas(sheet, /ﾊﾟﾀﾝ|パタン/) && sheetHas(sheet, /BLIZZAK/i);
  }

  function isVanWinterSheet(sheet) {
    return /^V$/i.test(text(sheet.name)) || sheetHas(sheet, /バン|小型トラック|軽商用車|W989|VL10/i);
  }

  function isIcePartnerSheet(sheet) {
    return /ｱｲｽﾊﾟ|アイスパ/i.test(text(sheet.name)) || sheetHas(sheet, /ICEPARTNER/i);
  }

  function sheetHas(sheet, pattern) {
    for (const row of sheet.rows) {
      if (!row) continue;
      for (const cell of row.values()) if (pattern.test(text(cell.value))) return true;
    }
    return false;
  }

  function extractPyrWinterSheet(sheet, diagnostics) {
    const products = [];
    for (let r = 1; r < sheet.rows.length; r++) {
      const patternRow = sheet.rows[r];
      if (!patternRow || !rowIncludes(patternRow, /ﾊﾟﾀﾝ|パタン/)) continue;
      const brandRow = findPreviousRow(sheet.rows, r, /ﾌﾞﾗﾝﾄﾞ|ブランド/);
      const patternColumns = [...patternRow]
        .map(([column, cell]) => [column, winterProductName(cell.value)])
        .filter(([, name]) => name && !/ﾊﾟﾀﾝ|パタン/i.test(name));
      if (!patternColumns.length) continue;

      const lastSizes = new Map();
      for (let dataRowIndex = r + 2; dataRowIndex < Math.min(sheet.rows.length, r + 170); dataRowIndex++) {
        const row = sheet.rows[dataRowIndex];
        if (!row) continue;
        if (dataRowIndex > r + 2 && rowIncludes(row, /ﾌﾞﾗﾝﾄﾞ|ブランド/)) break;
        for (const [column, cell] of row) {
          const baseSize = baseTireSize(cell.value);
          if (baseSize) lastSizes.set(column, baseSize);
        }
        for (const [patternColumn, subbrand] of patternColumns) {
          const sizeColumn = nearestLeftSizeColumn(lastSizes, patternColumn);
          if (!sizeColumn) {
            const rawCost = getValue(row, patternColumn + 3);
            const rawCode = getValue(row, patternColumn + 2);
            if (text(rawCost) || text(rawCode)) addIssue(diagnostics, sheet.name, dataRowIndex, "サイズ不明", { product: subbrand, code: text(rawCode), value: text(rawCost) });
            continue;
          }
          const cost = price(getValue(row, patternColumn + 3));
          if (!validPrice(cost)) {
            const rawCost = getValue(row, patternColumn + 3);
            const rawCode = getValue(row, patternColumn + 2);
            if (text(rawCost) || text(rawCode)) addIssue(diagnostics, sheet.name, dataRowIndex, "価格不明または不正", { product: subbrand, size: lastSizes.get(sizeColumn), code: text(rawCode), value: text(rawCost) });
            continue;
          }
          const code = text(getValue(row, patternColumn + 2));
          const brand = winterBrandForColumn(brandRow, patternColumn, "BLIZZAK");
          const size = buildTireSize(lastSizes.get(sizeColumn), "", "");
          products.push({ brand, subbrand, size, inch: extractInch(size), code, cost, source: sheet.name, sourceRow: dataRowIndex, sourceColumn: patternColumn + 3, parser: "冬PYR" });
        }
      }
    }
    return products;
  }

  function extractPyrRftSheet(sheet, diagnostics) {
    const products = [];
    for (let r = 1; r < sheet.rows.length; r++) {
      const brandRow = sheet.rows[r];
      if (!brandRow || !rowIncludes(brandRow, /BLIZZAK\s*RFT/i)) continue;
      const headerRow = sheet.rows[r + 1];
      if (!headerRow || !rowIncludes(headerRow, /ｻｲｽﾞ|サイズ/)) continue;
      const sizeColumns = [...headerRow]
        .filter(([, cell]) => /ｻｲｽﾞ|サイズ/.test(text(cell.value)))
        .map(([column]) => column);
      if (!sizeColumns.length) continue;

      for (let dataRowIndex = r + 2; dataRowIndex < Math.min(sheet.rows.length, r + 90); dataRowIndex++) {
        const row = sheet.rows[dataRowIndex];
        if (!row) continue;
        if (dataRowIndex > r + 2 && rowIncludes(row, /ﾌﾞﾗﾝﾄﾞ|ブランド/)) break;
        for (const sizeColumn of sizeColumns) {
          const size = buildTireSize(getValue(row, sizeColumn), "", "");
          if (!size) continue;
          const cost = price(getValue(row, sizeColumn + 4));
          if (!validPrice(cost)) {
            const rawCost = getValue(row, sizeColumn + 4);
            const rawCode = getValue(row, sizeColumn + 3);
            if (text(rawCost) || text(rawCode)) addIssue(diagnostics, sheet.name, dataRowIndex, "価格不明または不正", { product: "RFT", size, code: text(rawCode), value: text(rawCost) });
            continue;
          }
          products.push({
            brand: "BLIZZAK",
            subbrand: "RFT",
            size,
            inch: extractInch(size),
            code: text(getValue(row, sizeColumn + 3)),
            cost,
            source: sheet.name,
            sourceRow: dataRowIndex,
            sourceColumn: sizeColumn + 4,
            parser: "冬RFT"
          });
        }
      }
    }
    return products;
  }

  function extractVanWinterSheet(sheet, diagnostics) {
    const products = [];
    for (let r = 1; r < sheet.rows.length; r++) {
      const headerRow = sheet.rows[r];
      if (!headerRow || !rowIncludes(headerRow, /ｻｲｽﾞ|サイズ/)) continue;
      const sizeColumns = [...headerRow]
        .filter(([, cell]) => /ｻｲｽﾞ|サイズ/.test(text(cell.value)))
        .map(([column]) => column);
      if (!sizeColumns.length) continue;
      const brandRow = findPreviousRow(sheet.rows, r, /BLIZZAK|ｵｰﾙｼｰｽﾞﾝ|オールシーズン/i) || sheet.rows[r - 1];

      const productColumns = [];
      for (let i = 0; i < sizeColumns.length; i++) {
        const sizeColumn = sizeColumns[i];
        const nextSizeColumn = sizeColumns[i + 1] || 999;
        for (const [column, cell] of headerRow) {
          if (column <= sizeColumn || column >= nextSizeColumn) continue;
          const subbrand = winterProductName(cell.value);
          if (subbrand) productColumns.push({ sizeColumn, column, subbrand });
        }
      }
      if (!productColumns.length) continue;

      const lastSizes = new Map();
      for (let dataRowIndex = r + 2; dataRowIndex < Math.min(sheet.rows.length, r + 120); dataRowIndex++) {
        const row = sheet.rows[dataRowIndex];
        if (!row) continue;
        if (rowIncludes(row, /※は|M812Ⅱ は/)) break;
        const stopAfterRow = dataRowIndex > r + 2 && rowIncludes(row, /ｻｲｽﾞ|サイズ/);
        for (const sizeColumn of sizeColumns) {
          const baseSize = baseTireSize(getValue(row, sizeColumn));
          if (baseSize) lastSizes.set(sizeColumn, baseSize);
        }
        for (const entry of productColumns) {
          const baseSize = lastSizes.get(entry.sizeColumn);
          if (!baseSize) {
            const rawCost = getValue(row, entry.column + 2);
            const rawCode = getValue(row, entry.column + 1);
            if (text(rawCost) || text(rawCode)) addIssue(diagnostics, sheet.name, dataRowIndex, "サイズ不明", { product: entry.subbrand, code: text(rawCode), value: text(rawCost) });
            continue;
          }
          const cost = price(getValue(row, entry.column + 2));
          if (!validPrice(cost)) {
            const rawCost = getValue(row, entry.column + 2);
            const rawCode = getValue(row, entry.column + 1);
            if (text(rawCost) || text(rawCode)) addIssue(diagnostics, sheet.name, dataRowIndex, "価格不明または不正", { product: entry.subbrand, size: baseSize, code: text(rawCode), value: text(rawCost) });
            continue;
          }
          const code = text(getValue(row, entry.column + 1));
          const brand = winterBrandForColumn(brandRow, entry.column, "");
          const li = getValue(row, entry.sizeColumn + 1);
          const size = buildTireSize(baseSize, li, "");
          products.push({
            brand: brand || "BLIZZAK",
            subbrand: entry.subbrand,
            size,
            inch: extractInch(size),
            code,
            cost,
            source: sheet.name,
            sourceRow: dataRowIndex,
            sourceColumn: entry.column + 2,
            parser: "冬V"
          });
        }
        if (stopAfterRow) break;
      }
    }
    return products;
  }

  function extractIcePartnerSheet(sheet, diagnostics) {
    const products = [];
    let productName = "ICEPARTNER2";
    for (let r = 1; r < Math.min(sheet.rows.length, 40); r++) {
      const row = sheet.rows[r];
      if (!row) continue;
      for (const cell of row.values()) {
        const value = text(cell.value).normalize("NFKC");
        if (/ICEPARTNER/i.test(value)) productName = value.replace(/\s+/g, "");
      }
    }
    for (let r = 1; r < sheet.rows.length; r++) {
      const row = sheet.rows[r];
      if (!row) continue;
      for (const [column, cell] of row) {
        const size = buildTireSize(cell.value, "", "");
        if (!size) continue;
        const cost = price(getValue(row, column + 3));
        if (!validPrice(cost)) {
          const rawCost = getValue(row, column + 3);
          const rawCode = getValue(row, column + 1);
          if (text(rawCost) || text(rawCode)) addIssue(diagnostics, sheet.name, r, "価格不明または不正", { product: productName, size, code: text(rawCode), value: text(rawCost) });
          continue;
        }
        products.push({
          brand: "ICEPARTNER",
          subbrand: productName,
          size,
          inch: extractInch(size),
          code: text(getValue(row, column + 1)),
          cost,
          source: sheet.name,
          sourceRow: r,
          sourceColumn: column + 3,
          parser: "冬ICEPARTNER"
        });
      }
    }
    return products;
  }

  function summerVanProductName(rows, headerRowIndex, sizeColumn) {
    for (let r = headerRowIndex - 1; r >= Math.max(1, headerRowIndex - 6); r--) {
      const row = rows[r];
      if (!row) continue;
      for (let column = sizeColumn - 2; column <= sizeColumn + 2; column++) {
        const name = commercialProductName(getValue(row, column));
        if (name) return name;
      }
      for (const [, cell] of row) {
        const name = commercialProductName(cell.value);
        if (name) return name;
      }
    }
    return "";
  }

  function commercialProductName(value) {
    const v = text(value).normalize("NFKC").replace(/\s+/g, " ").trim();
    if (!v || GENERIC.test(v) || looksLikeSize(v)) return "";
    if (/^(?:PR\s*LI|LI\s*PR|LI|PR|サイズ|ｻｲｽﾞ|メ希|オープン価格|備考)$/i.test(v)) return "";
    if (/^\d{2,3}(?:\/\d{2,3})?[A-Z]?$/i.test(v) || /^[\d.,\s]+$/.test(v)) return "";
    if (/^[★☆◇◆□■○◎●※⑩⑪⑫]+$/.test(v)) return "";
    return v;
  }

  function rowHasProductNameOnly(row) {
    const values = rowValues(row);
    if (values.length !== 1) return false;
    return Boolean(commercialProductName(values[0]));
  }

  function rightmostValidPrice(row, startColumn) {
    return [...row]
      .filter(([column]) => column > startColumn)
      .map(([column, cell]) => ({ column, cost: price(cell.value) }))
      .filter(entry => validPrice(entry.cost))
      .sort((a, b) => b.column - a.column)[0] || null;
  }

  function nearbyServiceValue(row, sizeColumn) {
    for (const column of [sizeColumn + 1, sizeColumn + 2, sizeColumn - 1]) {
      const value = serviceValue(getValue(row, column));
      if (value) return value;
    }
    return "";
  }

  function serviceValue(value) {
    const normalized = text(value).normalize("NFKC").toUpperCase();
    return /^(?:\d{2,3}(?:\/\d{2,3})?[A-Z]?|6PR|8PR|10PR)$/.test(normalized) ? normalized : "";
  }

  function nearestBrandAbove(rows, rowIndex, productColumn) {
    for (let r = rowIndex - 1; r >= Math.max(1, rowIndex - 80); r--) {
      const row = rows[r];
      if (!row) continue;
      const brands = [...row]
        .map(([column, cell]) => [column, brandFromHeader(cell.value)])
        .filter(([, brand]) => brand)
        .filter(([column]) => column <= productColumn)
        .sort((a, b) => a[0] - b[0]);
      if (brands.length) return brands[brands.length - 1][1];
    }
    return "";
  }

  function rowValues(row) {
    return [...(row?.values() || [])].map(cell => text(cell.value)).filter(Boolean);
  }

  function rowIncludes(row, pattern) {
    for (const cell of row.values()) if (pattern.test(text(cell.value))) return true;
    return false;
  }

  function findPreviousRow(rows, rowIndex, pattern) {
    for (let r = rowIndex - 1; r >= Math.max(1, rowIndex - 8); r--) {
      const row = rows[r];
      if (row && rowIncludes(row, pattern)) return row;
    }
    return null;
  }

  function nearestLeftSizeColumn(lastSizes, productColumn) {
    const candidates = [...lastSizes.keys()].filter(column => column < productColumn).sort((a, b) => a - b);
    return candidates[candidates.length - 1] || 0;
  }

  function winterProductName(value) {
    const v = text(value).normalize("NFKC").replace(/\s+/g, " ").trim();
    if (!v || GENERIC.test(v) || looksLikeSize(v)) return "";
    if (/^(?:ﾊﾟﾀﾝ|パタン|LI|PR|チューブレス|チューブタイプ|メ希|オープン価格|備考)$/i.test(v)) return "";
    if (/^\d{2,3}(?:\/\d{2,3})?[A-Z]$/i.test(v)) return "";
    if (/^[★☆◇◆□■○◎●※⑩⑪⑫A-Z]$/.test(v) || /^[\d.,\s]+$/.test(v)) return "";
    if (/^P[XSY]R0$/i.test(v) || /^[A-Z]{2,5}$/.test(v) && !/^WZ|VRX|DM|VL|W\d|M\d|ICE/i.test(v)) return "";
    return v;
  }

  function winterBrandForColumn(brandRow, productColumn, fallback) {
    if (!brandRow) return fallback;
    const candidates = [...brandRow]
      .map(([column, cell]) => [column, winterBrandName(cell.value)])
      .filter(([, brand]) => brand && !/ブランド|ﾌﾞﾗﾝﾄﾞ/i.test(brand))
      .filter(([column]) => column <= productColumn)
      .sort((a, b) => a[0] - b[0]);
    return candidates.length ? candidates[candidates.length - 1][1] : fallback;
  }

  function winterBrandName(value) {
    const v = text(value).normalize("NFKC").replace(/\s+/g, "").trim();
    if (!v) return "";
    if (/ICEPARTNER/i.test(v)) return "ICEPARTNER";
    if (/BLIZZAK/i.test(v)) return "BLIZZAK";
    if (/オールシーズン|ｵｰﾙｼｰｽﾞﾝ/i.test(text(value))) return "オールシーズン";
    return canonicalExact(v);
  }

  function resolveProductBlock(rows, productRow, priceColumn, brand) {
    if (!productRow || !priceColumn) return "";
    const section = findBrandSection(rows, productRow);
    const productColumn = resolveProductColumn(rows, section.row, productRow, priceColumn, brand);
    return productNameForBlock(rows, section.row, productRow, productColumn || priceColumn - 2, brand);
  }

  function resolveProductColumn(rows, brandRow, productRow, priceColumn, brand) {
    if (!brandRow || !priceColumn) return 0;
    let headerEnd = productRow - 1;
    for (let r = brandRow + 1; r < productRow; r++) {
      const row = rows[r];
      if (row && [...row.values()].some(cell => text(cell.value).includes("サイズ"))) {
        headerEnd = r;
        break;
      }
    }
    const start = Math.max(1, priceColumn - 4);
    const candidates = [];
    for (let column = start; column <= priceColumn; column++) {
      const values = [];
      const brandCell = text(getValue(rows[brandRow], column));
      if (brand && brandCell.toUpperCase().startsWith(`${brand.toUpperCase()} `)) {
        values.push(brandCell.slice(brand.length).trim());
      }
      for (let r = brandRow + 1; r <= headerEnd; r++) {
        const value = cleanProductName(getValue(rows[r], column), brand);
        if (value) values.push(value);
      }
      if (values.length) candidates.push(column);
    }
    return candidates.length ? candidates[candidates.length - 1] : 0;
  }

  function findBrandSection(rows, productRow) {
    for (let r = productRow - 1; r >= Math.max(1, productRow - 140); r--) {
      const row = rows[r];
      if (!row) continue;
      const brands = [];
      let hasLabel = false;
      for (const [column, cell] of row) {
        const value = text(cell.value);
        if (value.includes("ブランド")) hasLabel = true;
        const brand = brandFromHeader(value);
        if (brand) brands.push([column, brand]);
      }
      if (brands.length >= 2 || (brands.length && hasLabel)) {
        return { row: r, brands: brands.sort((a, b) => a[0] - b[0]) };
      }
    }
    return { row: 0, brands: [] };
  }

  function brandForColumn(brands, productColumn) {
    const candidates = brands.filter(([column]) => column <= productColumn);
    return candidates.length ? candidates[candidates.length - 1][1] : "";
  }

  function productNameForBlock(rows, brandRow, productRow, productColumn, brand) {
    if (!brandRow) return "";
    let headerEnd = productRow - 1;
    for (let r = brandRow + 1; r < productRow; r++) {
      const row = rows[r];
      if (row && [...row.values()].some(cell => text(cell.value).includes("サイズ"))) {
        headerEnd = r;
        break;
      }
    }
    const values = [];
    const brandCell = text(getValue(rows[brandRow], productColumn));
    if (brandCell.toUpperCase().startsWith(`${brand.toUpperCase()} `)) {
      values.push(brandCell.slice(brand.length).trim());
    }
    for (let r = brandRow + 1; r <= headerEnd; r++) {
      for (const column of [productColumn, productColumn + 1]) {
        const value = cleanProductName(getValue(rows[r], column), brand);
        if (value && !values.includes(value)) values.push(value);
      }
    }
    if (!values.length) {
      // RFTのように1商品名が複数のサイズ列へ横断している場合は左側の見出しを継承する。
      for (let column = productColumn - 1; column >= Math.max(1, productColumn - 20); column--) {
        const inherited = [];
        const headerValue = text(getValue(rows[brandRow], column));
        if (headerValue.toUpperCase().startsWith(`${brand.toUpperCase()} `)) {
          inherited.push(headerValue.slice(brand.length).trim());
        }
        for (let r = brandRow + 1; r <= headerEnd; r++) {
          const value = cleanProductName(getValue(rows[r], column), brand);
          if (value && !inherited.includes(value)) inherited.push(value);
        }
        if (inherited.length) return formatProductNames(inherited);
      }
    }
    return formatProductNames(values);
  }

  function formatProductNames(values) {
    if (!values.length) return "";
    if (values.some(value => value.toUpperCase() === "TYPE RV")) return "TYPE RV";
    const adrenalin = values.find(value => value.toUpperCase() === "ADRENALIN");
    if (adrenalin) {
      const model = values.find(value => /^RE\d/i.test(stripDecorations(value)) && !/RE004/i.test(value));
      const aliases = values.filter(value => /RE004/i.test(value)).map(stripDecorations);
      return [model ? `Adrenalin ${stripDecorations(model)}` : "Adrenalin", ...aliases].join(" / ");
    }
    const primary = stripDecorations(values[0]);
    const notes = values.slice(1).filter(isProductNote);
    const aliases = values.slice(1)
      .filter(value => /[\[\]{}《》〔〕]/.test(value))
      .map(stripDecorations)
      .filter(Boolean);
    if (notes.length) return [`${primary} ${notes.join(" ")}`, ...aliases].join(" / ");
    return [primary, ...aliases].join(" / ");
  }

  function isProductNote(value) {
    return /^\(?（?\s*新車装着[^\n\r)]*(?:ﾊﾟﾀｰﾝ|パターン)[^\n\r)]*\s*\)?）?$/i.test(text(value).normalize("NFKC"));
  }

  function stripDecorations(value) {
    return text(value).replace(/^[A-C]\)/, "").replace(/[\[\]{}《》〔〕]/g, "").trim();
  }

  function createDiagnostics(sheets) {
    return {
      sheetNames: sheets.map(sheet => sheet.name),
      issues: []
    };
  }

  function addIssue(diagnostics, sheet, row, reason, detail = {}) {
    if (!diagnostics) return;
    diagnostics.issues.push({
      sheet,
      row: Number(row) || 0,
      reason,
      product: text(detail.product),
      brand: text(detail.brand),
      size: text(detail.size),
      code: text(detail.code),
      value: text(detail.value)
    });
  }

  function buildDiagnostics(sheets, rawProducts, uniqueProducts, diagnostics) {
    const duplicateMap = new Map();
    rawProducts.forEach(product => {
      const key = productKey(product);
      const list = duplicateMap.get(key) || [];
      list.push(product);
      duplicateMap.set(key, list);
    });
    const duplicates = [...duplicateMap.values()].filter(list => list.length > 1);
    const duplicateCount = duplicates.reduce((sum, list) => sum + list.length - 1, 0);
    const issues = diagnostics.issues.map(issue => ({ ...issue }));
    const unknownProducts = uniqueProducts.filter(product => !product.subbrand || product.subbrand === "商品名記載なし");
    unknownProducts.forEach(product => {
      issues.push({
        sheet: product.source,
        row: product.sourceRow || 0,
        reason: "商品名不明",
        product: product.subbrand || "",
        brand: product.brand,
        size: product.size,
        code: product.code,
        value: product.cost
      });
    });
    duplicates.slice(0, 200).forEach(list => {
      const product = list[0];
      issues.push({
        sheet: product.source,
        row: product.sourceRow || 0,
        reason: "重複データ",
        product: product.subbrand,
        brand: product.brand,
        size: product.size,
        code: product.code,
        value: `${list.length}件`
      });
    });

    const sheetSummaries = sheets.map(sheet => {
      const products = uniqueProducts.filter(product => product.source === sheet.name);
      const sheetIssues = issues.filter(issue => issue.sheet === sheet.name);
      return {
        name: sheet.name,
        productCount: products.length,
        sizeCount: new Set(products.map(product => normalizeSize(product.size)).filter(Boolean)).size,
        warningCount: sheetIssues.length,
        priceMissingCount: sheetIssues.filter(issue => issue.reason.includes("価格")).length,
        sizeMissingCount: sheetIssues.filter(issue => issue.reason.includes("サイズ")).length,
        unknownProductCount: sheetIssues.filter(issue => issue.reason.includes("商品名")).length
      };
    });

    return {
      sheets: diagnostics.sheetNames,
      sheetSummaries,
      totals: {
        productCount: uniqueProducts.length,
        rawProductCount: rawProducts.length,
        sizeCount: new Set(uniqueProducts.map(product => normalizeSize(product.size)).filter(Boolean)).size,
        skippedRowCount: issues.filter(issue => !issue.reason.includes("重複")).length,
        warningCount: issues.length,
        unknownProductCount: unknownProducts.length,
        priceMissingCount: issues.filter(issue => issue.reason.includes("価格")).length,
        sizeMissingCount: issues.filter(issue => issue.reason.includes("サイズ")).length,
        duplicateCount
      },
      counts: {
        byBrand: countBy(uniqueProducts, product => product.brand || "不明"),
        byProduct: countBy(uniqueProducts, product => product.subbrand || "商品名記載なし"),
        bySize: countBy(uniqueProducts, product => product.size || "サイズ不明"),
        byInch: countBy(uniqueProducts, product => product.inch ? `${product.inch}インチ` : "インチ不明")
      },
      issues: issues.slice(0, 300),
      issueOverflowCount: Math.max(0, issues.length - 300)
    };
  }

  function countBy(items, getter) {
    return Object.fromEntries([...items.reduce((map, item) => {
      const key = getter(item);
      map.set(key, (map.get(key) || 0) + 1);
      return map;
    }, new Map())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja")));
  }

  function productKey(product) {
    return [product.brand, product.subbrand, normalizeSize(product.size), product.code, product.cost].join("|").toUpperCase();
  }

  function deduplicate(products) {
    const seen = new Set();
    return products.filter(product => {
      const key = productKey(product);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function withProductCategory(product) {
    return { ...product, productCategory: detectProductCategory(product) };
  }

  function detectProductCategory(product) {
    const sheet = normalizeCategoryText(product.source);
    const name = normalizeCategoryText([product.brand, product.subbrand, product.parser].join(" "));
    const size = normalizeCategoryText(product.size);
    if (/(^|[^A-Z])OE([^A-Z]|$)|OEM/.test(sheet) || /(^|[^A-Z])OE([^A-Z]|$)|OEM|新車装着/.test(name)) return "oem";
    if (
      /(^|[^A-Z])(?:LV|LRB|V)([^A-Z]|$)/.test(sheet) ||
      /VL|W300|W979|W989|DURAVIS|(^|[^A-Z])RD([^A-Z]|$)|VAN|バン|小型トラック|軽商用/.test(name) ||
      /(?:^|[^A-Z0-9])(?:6PR|8PR)(?:[^A-Z0-9]|$)/.test(size) ||
      /(?:^|\s)\d{2,3}\/\d{2,3}[A-Z]?(?:\s|$)/.test(size)
    ) return "van";
    return "normal";
  }

  function normalizeCategoryText(value) {
    return text(value).normalize("NFKC").toUpperCase().replace(/\s+/g, " ");
  }

  function buildTireSize(baseSize, loadIndex, speedSymbol) {
    const rawBase = text(baseSize).normalize("NFKC").replace(/[×ｘ]/g, "x").replace(/\s+/g, " ").trim();
    const sizeMatch = rawBase.match(/(?:\d{3}\/\d{2,3}(?:R|RF)\d{2}(?:\.5)?)|(?:\d{3}R\d{2}(?:\.5)?)|(?:\d{2}x\d(?:\.\d{2})?R\d{2}(?:\.5)?)|(?:\d(?:\.\d{2})?R\d{2}(?:\.5)?)/i);
    if (!sizeMatch) return "";
    const base = sizeMatch[0].toUpperCase().replace("X", "×");
    const existingService = rawBase.slice((sizeMatch.index || 0) + sizeMatch[0].length);
    const serviceRaw = [existingService, loadIndex, speedSymbol]
      .map(value => text(value).normalize("NFKC").toUpperCase())
      .filter(Boolean)
      .join(" ");
    const combinedService = serviceRaw.match(/\b\d{2,3}(?:\/\d{2,3})?[A-Z]\b/)?.[0] || "";
    if (combinedService) return `${base} ${combinedService}`;
    const ply = serviceRaw.match(/\b(?:6PR|8PR|10PR)\b/)?.[0] || "";
    if (ply) return `${base} ${ply}`;
    const load = serviceRaw.match(/\d{2,3}(?:\/\d{2,3})?/)?.[0] || "";
    const speedToken = serviceRaw
      .split(/\s+/)
      .map(value => value.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, ""))
      .find(value => /^(?:\d{2,3}(?:\/\d{2,3})?)?[A-Z]$/.test(value));
    const speed = speedToken?.match(/[A-Z]$/)?.[0] || "";
    const service = `${load}${speed}`;
    return service ? `${base} ${service}` : base;
  }

  function baseTireSize(value) {
    return text(value).normalize("NFKC").replace(/[×ｘ]/g, "x").toUpperCase()
      .match(/(?:\d{3}\/\d{2,3}(?:R|RF)\d{2}(?:\.5)?)|(?:\d{3}R\d{2}(?:\.5)?)|(?:\d{2}x\d(?:\.\d{2})?R\d{2}(?:\.5)?)|(?:\d(?:\.\d{2})?R\d{2}(?:\.5)?)/i)?.[0].replace("X", "×") || "";
  }

  function canonicalExact(value) {
    const cleaned = text(value);
    return window.APP_DATA.brandAliases[cleaned.toUpperCase()] || cleaned;
  }
  function canonical(value) {
    return brandFromHeader(value) || canonicalExact(value);
  }
  function brandFromHeader(value) {
    const cleaned = text(value);
    const exact = canonicalExact(cleaned);
    const brands = window.APP_DATA.preferredBrandOrder;
    const exactBrand = brands.find(brand => brand.toUpperCase() === exact.toUpperCase());
    if (exactBrand) return exactBrand;
    return brands.find(brand => cleaned.toUpperCase().startsWith(`${brand.toUpperCase()} `)) || "";
  }
  function extractInch(size) { return Number(normalizeSize(size).match(/(?:R|RF)(\d{2}(?:\.5)?)/)?.[1] || 0); }
  function looksLikeSize(value) { return /(?:\d{3}\/\d{2,3}(?:R|RF)\d{2}(?:\.5)?)|(?:\d{3}R\d{2}(?:\.5)?)|(?:\d{2}[X×]\d(?:\.\d{2})?R\d{2}(?:\.5)?)|(?:\d(?:\.\d{2})?R\d{2}(?:\.5)?)/i.test(normalizeSize(value)); }
  function normalizeSize(value) { return text(value).normalize("NFKC").toUpperCase().replace(/[ｘX]/g, "×").replace(/\s+/g, ""); }
  function getValue(row, col) { return row?.get(col)?.value ?? ""; }
  function text(value) { return value == null ? "" : String(value).replace(/\u0000/g, "").trim(); }
  function price(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
    const cleaned = text(value).replace(/[￥¥,\s]/g, "");
    if (!cleaned) return NaN;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
  }
  function validPrice(value) { return Number.isFinite(value) && value >= 100 && value <= 1000000; }
  function columnNumber(ref) { return [...String(ref).match(/[A-Z]+/i)?.[0].toUpperCase() || ""].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0); }
  async function readXml(zip, path) { const file = zip.file(path); if (!file) throw new Error(`Missing ${path}`); return parseXml(await file.async("string")); }
  function parseXml(textValue) { const xml = new DOMParser().parseFromString(textValue, "application/xml"); if (xml.querySelector("parsererror")) throw new Error("Invalid workbook XML"); return xml; }
  function normalizeWorkbookPath(path) {
    const parts = ["xl", ...String(path).replaceAll("\\", "/").replace(/^\/|^xl\//g, "").split("/")], result = [];
    for (const part of parts) part === ".." ? result.pop() : part !== "." && result.push(part);
    return result.join("/");
  }
})();
