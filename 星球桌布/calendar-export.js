(() => {
  const encoder = new TextEncoder();
  const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const types = 'http://schemas.openxmlformats.org/package/2006/content-types';
  const packageRel = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const colorNames = { '#a8432f': '穀倉紅', '#7c9a6d': '鼠尾草綠', '#d9a441': '芥末黃', '#4f6d8f': '丹寧藍', '#a07cb0': '薰衣草紫' };
  const xmlEntities = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
  const xml = value => String(value ?? '').replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, '')
    .replace(/[&<>]/g, character => xmlEntities[character]);
  const xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const textCell = (address, value, style = 0) =>
    `<c r="${address}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  const numericCell = (address, value, style) => `<c r="${address}" s="${style}"><v>${value}</v></c>`;

  function dateCell(address, date) {
    const serial = Date.parse(date + 'T00:00:00Z') / 86400000 + 25569;
    if (!Number.isFinite(serial) || serial < 2) return textCell(address, date);
    return numericCell(address, serial < 61 ? serial - 1 : serial, 2);
  }
  function timeCell(address, time) {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time || '')) return textCell(address, time);
    const [hour, minute] = time.split(':').map(Number);
    return numericCell(address, (hour * 60 + minute) / 1440, 3);
  }
  function colorText(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color || '')) return '';
    const name = colorNames[color.toLowerCase()];
    return name ? `${name} (${color.toUpperCase()})` : color.toUpperCase();
  }

  function workbookParts(events) {
    const headers = ['日期', '時間', '行程內容', '標籤顏色'];
    const rows = ['<row r="1">' + headers.map((header, i) => textCell('ABCD'[i] + '1', header, 1)).join('') + '</row>'];
    for (const [index, event] of events.entries()) {
      const n = index + 2;
      rows.push(`<row r="${n}">${dateCell('A' + n, event.date)}${timeCell('B' + n, event.time)}${textCell('C' + n, event.title, 4)}${textCell('D' + n, colorText(event.color))}</row>`);
    }
    return {
      '[Content_Types].xml': `<Types xmlns="${types}">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
        <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
      </Types>`,
      '_rels/.rels': `<Relationships xmlns="${packageRel}"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      'xl/workbook.xml': `<workbook xmlns="${main}" xmlns:r="${rel}"><bookViews><workbookView/></bookViews><sheets><sheet name="行程" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `<Relationships xmlns="${packageRel}">
        <Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/>
        <Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/>
      </Relationships>`,
      'xl/styles.xml': `<styleSheet xmlns="${main}">
        <numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="hh:mm"/></numFmts>
        <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
        <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF7A4C2F"/><bgColor indexed="64"/></patternFill></fill></fills>
        <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
        <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
        <cellXfs count="5">
          <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
          <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
          <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
          <xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
          <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
        </cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
      </styleSheet>`,
      'xl/worksheets/sheet1.xml': `<worksheet xmlns="${main}">
        <dimension ref="A1:D${rows.length}"/>
        <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
        <cols><col min="1" max="1" width="15" customWidth="1"/><col min="2" max="2" width="13" customWidth="1"/>
        <col min="3" max="3" width="72" customWidth="1"/><col min="4" max="4" width="26" customWidth="1"/></cols>
        <sheetData>${rows.join('')}</sheetData><autoFilter ref="A1:D${rows.length}"/>
      </worksheet>`
    };
  }

  const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    return value;
  });
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function zip(parts) {
    // OOXML uses a ZIP container. Store the short XML parts without compression.
    const files = [], directory = [];
    let offset = 0, directorySize = 0;
    for (const [name, part] of Object.entries(parts)) {
      const filename = encoder.encode(name), bytes = encoder.encode(xmlHeader + part);
      const crc = crc32(bytes);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true);
      local.setUint16(12, 33, true); // ZIP date: 1980-01-01
      local.setUint32(14, crc, true);
      local.setUint32(18, bytes.length, true); local.setUint32(22, bytes.length, true);
      local.setUint16(26, filename.length, true);
      files.push(local.buffer, filename, bytes);

      const central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true); central.setUint16(6, 20, true);
      central.setUint16(14, 33, true);
      central.setUint32(16, crc, true);
      central.setUint32(20, bytes.length, true); central.setUint32(24, bytes.length, true);
      central.setUint16(28, filename.length, true); central.setUint32(42, offset, true);
      directory.push(central.buffer, filename);
      offset += local.byteLength + filename.length + bytes.length;
      directorySize += central.byteLength + filename.length;
    }
    const count = Object.keys(parts).length;
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, count, true); end.setUint16(10, count, true);
    end.setUint32(12, directorySize, true); end.setUint32(16, offset, true);
    return new Blob([...files, ...directory, end.buffer], { type: mime });
  }

  window.initCalendarExport = (form, loadEvents) => {
    const startInput = form.querySelector('[data-export-start]');
    const endInput = form.querySelector('[data-export-end]');
    for (const input of [startInput, endInput]) {
      const display = input.parentElement.querySelector('.export-date-format');
      const updateDisplay = () => {
        display.textContent = input.value ? input.value.replaceAll('-', '/') : '年/月/日';
      };
      input.addEventListener('input', updateDisplay);
      input.addEventListener('change', updateDisplay);
      updateDisplay();
    }
    form.querySelector('[data-export-download]').addEventListener('click', () => {
      const start = startInput.value, end = endInput.value;
      const status = form.querySelector('[data-export-status]');
      if (!startInput.validity.valid || !endInput.validity.valid) { status.textContent = '請輸入有效的日期。'; return; }
      if (start && end && start > end) { status.textContent = '起始日期不能晚於結束日期。'; return; }
      const events = loadEvents()
        .filter(event => event && typeof event.date === 'string' && (!start || event.date >= start) && (!end || event.date <= end))
        .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '99').localeCompare(b.time || '99'));
      if (!events.length) { status.textContent = '這個日期區間沒有可匯出的行程。'; return; }
      const url = URL.createObjectURL(zip(workbookParts(events)));
      const link = document.createElement('a');
      link.href = url;
      link.download = `星球行程-${start || end ? `${start || '不限'}_${end || '不限'}` : '全部'}.xlsx`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      status.textContent = `已匯出 ${events.length} 筆行程。`;
    });
  };
})();
